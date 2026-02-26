const input = `https://httpbin.org/get - Test GET request
https://httpbin.org/post - Test POST request  
https://httpbin.org/headers - Xem headers
https://httpbin.org/ip - Lấy IP address`;

// Reddit API with OAuth2
const redditInput = `Reddit API Usage Guide

Step 1: Get Access Token
POST https://www.reddit.com/api/v1/access_token
Headers:
  User-Agent: script:your_app_name:v1.0 (by /u/your_username)
  Authorization: Basic {base64(client_id:client_secret)}
Body (form-urlencoded):
  grant_type: password
  username: your_username
  password: your_password

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

GET https://oauth.reddit.com/api/v1/me - Get current user info
GET https://oauth.reddit.com/api/v1/me/karma - Get user karma
GET https://oauth.reddit.com/api/v1/me/prefs - Get user preferences
GET https://oauth.reddit.com/api/v1/me/trophies - Get user trophies
GET https://oauth.reddit.com/api/announcements/v1 - Get announcements
POST https://oauth.reddit.com/api/announcements/v1/read_all - Mark all announcements as read

All endpoints above require:
  Authorization: Bearer {access_token}
  User-Agent: your_app_name/1.0 by your_username

NOTE: adhere to required parameters and format for Reddit API request and response. If not followed, the API will return an error.`;

// Twilio WhatsApp API with Basic Auth
const twilioInput = `Twilio WhatsApp API Usage:

1. Sending messages using templates
POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
Headers:
  Authorization: Basic {base64(Account_SID:Auth_Token)}
Body (form-urlencoded):
  To: whatsapp:+[recipient_number]
  From: whatsapp:+[sender_number]
  ContentSid: [template_id]
  ContentVariables: {"1":"12/1","2":"3pm"}

The required parameters are:
- To: The recipient's WhatsApp number in the format 'whatsapp:+[number]'
- From: Your Twilio WhatsApp number in the format 'whatsapp:+[number]'
- ContentSid: The ID of the template you want to use (if you want to use a template)
- ContentVariables: A JSON string containing the variables for the template
- Auth_Token: Your Twilio account's authentication token
- Account_SID: Your Twilio account's SID

Available templates (with their parameters) are:
* message_opt_in - template_id: HX048d466c235e75fe38439e6b54b171b2 - This template don't require any parameters
* notifications_appointment_reminder_template - template_id: HXb5b62575e6e4ff6129ad7c8efe1f983e - This template requires 2 parameters: 1. Appointment date (e.g., "12/1"), 2. Appointment time (e.g., "3pm")
* notifications_order_update_template - template_id: HX350d429d32e64a552466cafecbe95f3c - This template requires 2 parameters: 1. Order date (e.g., "12th January 2025"), 2. Order time (e.g., "3pm")
* notification_order_tracking - template_id: HX1642ffbf48c51971b45513ad401e1717 - This template requires 2 parameters: 1. Order number (e.g., "#79326"), 2. Estimated arrival date (e.g., "June 28th, 2025")
* verifications_2fa_template - template_id: HX43cb1add60e91787940415fe9ddfcadd - This template requires 1 parameter: 1. Verification code (e.g., "409173")
The templates' parameters are passed in the ContentVariables field as a string with the format '{"1":"value1","2":"value2"}' where "1", "2", etc. are the parameter keys defined in the template.

2. Sending plain text messages:
POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
Headers:
  Authorization: Basic {base64(Account_SID:Auth_Token)}
Body (form-urlencoded):
  To: whatsapp:+[recipient_number]
  From: whatsapp:+[sender_number]
  Body: [message]

The required parameters are:
- To: The recipient's WhatsApp number in the format 'whatsapp:+[number]'
- From: Your Twilio WhatsApp number in the format 'whatsapp:+[number]'
- Body: The message you want to send
- Auth_Token: Your Twilio account's authentication token
- Account_SID: Your Twilio account's SID

FINAL NOTE: Make sure to include all of the parameters specified in the description, if not, the API won't work properly.
Furthermore, ALL PARAMETERS will be manually provided by the user, so you DON'T HAVE TO LOAD IT from a environment file.
So to recap, these are the parameters:
- Account_SID: Your Twilio account SID 
- Auth_Token: Your Twilio account authentication token
- To: The recipient's WhatsApp number in the format 'whatsapp:+[number]'
- From: Your Twilio WhatsApp number in the format 'whatsapp:+[number]'
- ContentSid: The ID of the template you want to use (optional)
- ContentVariables: A JSON string containing the variables for the template (optional)
- Body: The message you want to send (optional, only used if ContentSid is not provided)    
** PLEASE DON'T FORGET TO INCLUDE THESE PARAMETERS IN YOUR REQUEST **
For authentication, make sure to include both the Account_SID and Auth_Token (PROVIDED BY THE USER, PLEASE DO NOT LOAD IT FROM .env) in the request header as basic authentication.`;
