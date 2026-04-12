Reddit API Usage Guide
Step 1: Get Access Token
curl -X POST \
  -H "User-Agent: script:your_app_name:v1.0 (by /u/your_username)" \
  -d 'grant_type=password&username=your_username&password=your_password' \
  --user 'your_client_id:your_client_secret' \
  https://www.reddit.com/api/v1/access_token
Response:
{
  "access_token": "your_access_token_here",
  "token_type": "bearer",
  "expires_in": 3600,
  "scope": "*"
}

The required parameters for step 1 are (MUST HAVE AND WILL BE PROVIDED MANUALLY BY THE USER):
- grant_type: Always "password" for this flow
- username: Your Reddit username
- password: Your Reddit password
- client_id: Your Reddit app's client ID
- client_secret: Your Reddit app's client secret

Step 2: Use Access Token for API Calls
curl -H "Authorization: bearer your_access_token" \
     -A "your_app_name/1.0 by your_username" \
     https://oauth.reddit.com/api/v1/me

Response:
{
    "comment_karma": 0, 
    "created": 1389649907.0, 
    "created_utc": 1389649907.0, 
    "has_mail": false, 
    "has_mod_mail": false, 
    "has_verified_email": null, 
    "id": "1", 
    "is_gold": false, 
    "is_mod": true, 
    "link_karma": 1, 
    "name": "reddit_bot", 
    "over_18": true
}

The required parameters for step 2 are:
- Authorization: Bearer token obtained from step 1
- User-Agent: A unique identifier for your application, e.g., "your_app_name/1.0 by your_username"

NOTE: adhere to required parameters and format for Reddit API request and response. If not followed, the API will return an error.
Other endpoints:
Get (same format as https://oauth.reddit.com/api/v1/me)
- /api/v1/me
- /api/v1/me/karma
- /api/v1/me/prefs
- /api/v1/me/trophies
- /api/announcements/v1

Post (same format as https://oauth.reddit.com/api/v1/me):
- /api/announcements/v1/read_all
