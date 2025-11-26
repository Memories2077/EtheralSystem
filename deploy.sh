#!/bin/bash

# ===== Config =====
SERVER_IP="your.server.ip"  # Change this to your server's IP address
SSH_USER="your_ssh_user"  # Change this to your SSH username

IMAGE_NAME="reddit"
CONTAINER_NAME="reddit"

PORT_MAPPING="3000:3000"
DOCKERFILE_PATH="./Dockerfile"
CONTEXT_PATH="./"
SSH_KEY="../private_key"
MAX_RETRIES=3

# ===== Cloudflare Tunnel Config =====
APPNAME="redditmcp"  # Change this to your desired subdomain
DOMAIN="your_domain"  # Change this to your domain (note that this should be a domain you own and managed by Cloudflare)
LOCAL_PORT="3000"  # Port that your app runs on

# ==================

retry_count=0

while [ $retry_count -lt $MAX_RETRIES ]; do
    echo -e "\033[1;36m[INFO]\033[0m Testing workflow... (Attempt $((retry_count + 1))/$MAX_RETRIES)"

    docker build --platform linux/amd64 --no-cache -t $IMAGE_NAME -f $DOCKERFILE_PATH $CONTEXT_PATH
    exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo -e "\033[1;31m[ERROR]\033[0m Build failed with code $exit_code"

        docker rmi "$IMAGE_NAME" >/dev/null 2>&1 || true

        retry_count=$((retry_count + 1))
        sleep 2
        continue
    else
        echo -e "\033[1;32m[SUCCESS]\033[0m Build succeeded"
    fi

    echo -e "\033[1;36m[INFO]\033[0m Starting container..."

    timeout 10 docker run --rm --name $CONTAINER_NAME -p $PORT_MAPPING $IMAGE_NAME
    exit_code=$?

    if [ $exit_code -eq 124 ]; then
        echo -e "\033[1;32m[SUCCESS]\033[0m Container started successfully (timeout as expected)"
        docker rm $CONTAINER_NAME 2>/dev/null || true
        break  # Exit the loop on success
    else
        echo -e "\033[1;31m[ERROR]\033[0m Failed to start container with code $exit_code"
        docker rm $CONTAINER_NAME 2>/dev/null || true
        retry_count=$((retry_count + 1))
    fi
done

if [ $retry_count -eq $MAX_RETRIES ]; then
    echo -e "\033[1;31m[FATAL]\033[0m Max retries reached. Deployment failed."
    docker rm $CONTAINER_NAME 2>/dev/null || true
    docker rmi $IMAGE_NAME 2>/dev/null || true
    exit 1
fi

echo -e "\033[1;32m[SUCCESS]\033[0m Local testing completed successfully!"
echo -e "\033[1;33m[NEXT]\033[0m Ready to deploy to remote server."

# Tag and push image
docker tag $IMAGE_NAME $SERVER_IP:5000/$IMAGE_NAME
docker push $SERVER_IP:5000/$IMAGE_NAME

# Deploy to remote server AND setup Cloudflare Tunnel
echo -e "\033[1;36m[INFO]\033[0m Deploying to remote server and setting up Cloudflare Tunnel..."

ssh -i $SSH_KEY -t $SSH_USER@$SERVER_IP << EOF
        echo -e "\033[1;36m[INFO]\033[0m Stopping and removing existing container..."
        docker stop $CONTAINER_NAME || true
        docker rm $CONTAINER_NAME || true

        sleep 2

        echo -e "\033[1;36m[INFO]\033[0m Pulling latest image..."
        docker pull localhost:5000/$IMAGE_NAME

        sleep 2

        echo -e "\033[1;36m[INFO]\033[0m Starting new container..."
        docker run -d --name $CONTAINER_NAME -p $PORT_MAPPING localhost:5000/$IMAGE_NAME:latest

        echo -e "\033[1;32m[SUCCESS]\033[0m Remote deployment completed!"
        echo -e "\033[1;36m[INFO]\033[0m Container is running on port ${LOCAL_PORT}"

        # ===== Cloudflare Tunnel Setup on Server =====
        echo -e "\033[1;36m[INFO]\033[0m Setting up Cloudflare Tunnel on server..."

        # Check for Cloudflare cert
        CERT_PATH="\${HOME}/.cloudflared/cert.pem"
        if [ ! -f "\$CERT_PATH" ]; then
            echo -e "\033[1;31m[ERROR]\033[0m Cloudflare origin certificate not found!"
            echo "Please run 'cloudflared tunnel login' on the server first"
            echo "Or copy your cert.pem to \$CERT_PATH"
            exit 1
        fi

        TUNNEL_NAME="${APPNAME}-tunnel"
        CONFIG_FILE="cloudflared-${APPNAME}.yml"

        # Create new Cloudflare Tunnel
        echo "Creating tunnel: \${TUNNEL_NAME}..."
        CREATE_OUTPUT=\$(cloudflared tunnel create \${TUNNEL_NAME})
        TUNNEL_ID=\$(echo "\${CREATE_OUTPUT}" | grep -o '[a-f0-9-]\{36\}' | head -n 1)
        if [ -z "\${TUNNEL_ID}" ]; then
            echo -e "\033[1;31m[ERROR]\033[0m Failed to create tunnel"
            exit 1
        fi
        echo -e "\033[1;32m[SUCCESS]\033[0m Tunnel created with ID: \${TUNNEL_ID}"
       
        # Create configuration file with certificate path
        echo "Generating config file: \${CONFIG_FILE}"
        cat << EOFCONFIG > \${CONFIG_FILE}
tunnel: \${TUNNEL_ID}
credentials-file: \${HOME}/.cloudflared/\${TUNNEL_ID}.json
ingress:
  - hostname: ${APPNAME}.${DOMAIN}
    service: http://localhost:${LOCAL_PORT}
  - service: http_status:404
EOFCONFIG

        # Check if DNS record already exists
        echo "Checking if DNS record for ${APPNAME}.${DOMAIN} already exists..."
        DNS_CHECK=\$(cloudflared tunnel route dns \${TUNNEL_NAME} ${APPNAME}.${DOMAIN} 2>&1)

        if [[ \$DNS_CHECK == *"is already configured"* ]]; then
            echo -e "\033[1;33m[INFO]\033[0m DNS record for ${APPNAME}.${DOMAIN} already exists"
        elif [[ $? -eq 0 ]]; then
            echo -e "\033[1;32m[SUCCESS]\033[0m DNS record created for ${APPNAME}.${DOMAIN}"
        else
            echo -e "\033[1;31m[ERROR]\033[0m Failed to create DNS record: $DNS_CHECK"
            exit 1
        fi

        # Stop existing tunnel processes (if any)
        echo -e "\033[1;36m[INFO]\033[0m Stopping existing tunnel processes..."
        pkill -f "cloudflared.*${APPNAME}" || true
        sleep 2

        # Start the tunnel in background with logging
        echo -e "\033[1;36m[INFO]\033[0m Starting tunnel \${TUNNEL_NAME} in background..."
        echo -e "\033[1;33m[URL]\033[0m Your service will be available at: https://${APPNAME}.${DOMAIN}"
        echo -e "\033[1;36m[LOGS]\033[0m Logs: ${APPNAME}-cloudflared.log"

        sleep 2

        # Run tunnel in background with logging
        nohup cloudflared tunnel --config \${CONFIG_FILE} run \${TUNNEL_NAME} > ${APPNAME}-cloudflared.log 2>&1 &

        # Wait a bit and check if tunnel started successfully
        sleep 10
        if pgrep -f "cloudflared.*${APPNAME}" > /dev/null; then
            echo -e "\033[1;32m[SUCCESS]\033[0m Tunnel successfully started"
        else
            echo -e "\033[1;31m[ERROR]\033[0m Failed to start tunnel - check logs: ${APPNAME}-cloudflared.log"
            exit 1
        fi

EOF

# Check if deployment and tunnel setup was successful
if [ $? -eq 0 ]; then
    echo -e "\033[1;34m[STEP]\033[0m Cleaning up local images..."
    sleep 2

    # Remove local docker images (ignore errors if not exist)
    docker rmi "$SERVER_IP:5000/$IMAGE_NAME" >/dev/null 2>&1 || true
    docker rmi "$IMAGE_NAME" >/dev/null 2>&1 || true

    echo -e "\033[1;32m[SUCCESS]\033[0m Local cleanup completed ✅"
    echo -e "\n\033[1;33m[READY]\033[0m 🌐 MCP server is available at:"
    echo -e "   \033[1;32mhttps://${APPNAME}.${DOMAIN}\033[0m"
    echo -e "\n\033[1;33m[TEST]\033[0m Run the following to test the connection:"
    echo -e "   npx mcp-remote \"https://${APPNAME}.${DOMAIN}/mcp\"\n"
else
    echo -e "\033[1;31m[ERROR]\033[0m ❌ Deployment or tunnel setup failed!"
    exit 1
fi