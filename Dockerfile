# Sử dụng base image nhẹ
FROM node:20-alpine

# Thiết lập thư mục làm việc
WORKDIR /app

# Copy package.json và package-lock.json trước (để tối ưu Docker cache)
COPY package*.json ./

# Cập nhật npm và cài đặt dependencies
RUN npm install -g npm@latest
RUN npm install

# Vá lại các lỗi/lỗ hổng package nếu có (bỏ qua nếu có breaking changes)
RUN npm audit fix || true

# Copy source code sau khi cài đặt dependencies
COPY . .

# Set permission cho entrypoint script và đảm bảo line endings đúng
RUN chmod +x entrypoint.sh && sed -i 's/\r$//' entrypoint.sh

# Tạo các thư mục cần thiết để đảm bảo chúng tồn tại
RUN mkdir -p /app/src-generated-ts /app/src-generated-yaml /app/input /app/data


# Expose port nếu cần (có thể thêm nếu app có web interface)
# EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
