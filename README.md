# MCP Productivity Suite

![image](https://github.com/user-attachments/assets/c00bd83d-d06f-4b8d-98d2-559020b3bfd0)

## 📋 Table of Contents
- [Overview](#overview)
- [Features](#features)
- [User Flow](#user-flow)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Architecture](#architecture)
- [Natural Language Processing](#natural-language-processing)
- [Tech Stack](#tech-stack)
- [Recent Updates](#recent-updates)

## 🚀 Overview

MCP Productivity Suite is a powerful web application that seamlessly integrates with Google and Microsoft services to help users manage their calendar events and emails efficiently. The application leverages AI-powered natural language processing to enable users to create meetings and send emails using plain language instructions.

## ✨ Features

- **Multi-Provider Integration**
  - Google Calendar & Gmail services
  - Microsoft Outlook Calendar & Email services

- **Calendar Management**
  - View upcoming calendar events
  - Schedule new meetings with online meeting links
  - Real-time timezone conversion and detection
  - Automatic online meeting creation (Google Meet/Microsoft Teams)
  - Graceful handling of meeting links availability

- **Email Communication**
  - Send emails directly from the interface
  - Support for multiple recipients with TO, CC, and BCC fields
  - Email validation and formatting
  - Recipient count tracking and feedback

- **AI-Powered Natural Language Processing**
  - Create calendar events using natural language
  - Compose emails using conversational instructions
  - Intelligent timezone detection from user input
  - Enhanced email parsing with CC/BCC recognition

- **Modern User Interface**
  - Responsive design for all devices
  - Dark/Light mode support
  - Real-time feedback and notifications
  - Interactive animations and transitions
  - Premium visual design with sophisticated UI elements

## 👤 User Flow

1. **Authentication**
   - User arrives at the login screen
   - Selects either Google or Microsoft authentication
   - Authorizes the application to access their calendar and email
   - Returns to the application with proper authentication

2. **Dashboard Experience**
   - User views their upcoming calendar events
   - Can refresh calendar data at any time
   - Current timezone is displayed with ability to change

3. **Meeting Scheduling**
   - **Option 1:** Fill out the meeting form manually
     - Enter meeting title
     - Select start and end times
     - Add attendees (comma-separated emails)
     - Submit to create the meeting with online meeting link

   - **Option 2:** Use natural language
     - Enter a description like "Schedule a meeting with john@example.com tomorrow at 2 PM to 4 PM for Project Discussion"
     - AI processes the request with accurate timezone handling
     - Creates the meeting automatically with appropriate online link

4. **Email Sending**
   - **Option 1:** Fill out the email form manually
     - Enter recipients in TO field
     - Add optional CC and BCC recipients
     - Enter subject
     - Compose email body
     - Send email with recipient tracking

   - **Option 2:** Use natural language
     - Enter a description like "Send an email to sarah@example.com with subject 'Project Update', cc john@example.com and bcc hr@example.com, and tell her the project is on track"
     - AI processes the request, correctly identifying primary recipients, CC and BCC recipients
     - Sends the email automatically with proper recipient formatting

## 🔧 Installation

### Prerequisites
- Node.js (v14 or later)
- npm or yarn
- PostgreSQL database

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/mcp-server.git
   cd mcp-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory with the following variables:
   ```
   # Server Configuration
   PORT=3000
   HOST=localhost
   NODE_ENV=development

   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=mcp_database

   # Google OAuth Configuration
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

   # Microsoft OAuth Configuration
   MICROSOFT_CLIENT_ID=your_microsoft_client_id
   MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
   MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/microsoft/callback
   
   # JWT Secret
   JWT_SECRET=your_jwt_secret
   
   # Gemini API Key (for NLP)
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. **Initialize the database**
   ```bash
   npm run db:init
   # or
   yarn db:init
   ```

5. **Start the server**
   ```bash
   npm start
   # or
   yarn start
   ```

6. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## ⚙️ Configuration

### Database Schema

The application uses a PostgreSQL database with the following main table:

**users**
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  picture TEXT,
  google_id VARCHAR(255),
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expiry TIMESTAMP,
  microsoft_id VARCHAR(255),
  microsoft_access_token TEXT,
  microsoft_refresh_token TEXT,
  microsoft_token_expiry TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### OAuth Configuration

#### Google OAuth
1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Navigate to "APIs & Services" > "Credentials"
4. Create an OAuth 2.0 Client ID
5. Add the following scopes:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/gmail.send`
6. Add your redirect URL: `http://your-domain/auth/google/callback`

#### Microsoft OAuth
1. Go to the [Microsoft Azure Portal](https://portal.azure.com/)
2. Navigate to "App registrations"
3. Register a new application
4. Add the following Microsoft Graph API permissions:
   - `User.Read`
   - `Calendars.ReadWrite`
   - `Mail.Send`
5. Add your redirect URL: `http://your-domain/auth/microsoft/callback`

## 📡 API Documentation

### Authentication Endpoints

#### Google Authentication
- **GET** `/auth/google`
  - Initiates Google OAuth flow
  - No parameters required

- **GET** `/auth/google/callback`
  - Google OAuth callback endpoint
  - Query Parameters:
    - `code`: Authorization code from Google
  - Response: Redirects to dashboard with token

#### Microsoft Authentication
- **GET** `/auth/microsoft`
  - Initiates Microsoft OAuth flow
  - No parameters required

- **GET** `/auth/microsoft/callback`
  - Microsoft OAuth callback endpoint
  - Query Parameters:
    - `code`: Authorization code from Microsoft
  - Response: Redirects to dashboard with token

### Calendar Endpoints

#### Google Calendar
- **GET** `/calendar/events`
  - Fetches user's Google Calendar events
  - Headers:
    - `Authorization`: Bearer token
  - Response: Array of calendar events

- **POST** `/calendar/events`
  - Creates a new Google Calendar event
  - Headers:
    - `Authorization`: Bearer token
  - Body:
    ```json
    {
      "summary": "Meeting Title",
      "start": {
        "dateTime": "2023-04-01T10:00:00+00:00",
        "timeZone": "UTC"
      },
      "end": {
        "dateTime": "2023-04-01T11:00:00+00:00",
        "timeZone": "UTC"
      },
      "attendees": [
        {"email": "attendee1@example.com"},
        {"email": "attendee2@example.com"}
      ]
    }
    ```
  - Response: Created event details with Google Meet link

- **POST** `/calendar/nl-create`
  - Creates an event using natural language
  - Headers:
    - `Authorization`: Bearer token
  - Body:
    ```json
    {
      "text": "Schedule a meeting with john@example.com tomorrow at 2pm for Project Discussion",
      "timezone": "America/New_York"
    }
    ```
  - Response: Created event details with Google Meet link

#### Microsoft Calendar
- **GET** `/microsoft/calendar/events`
  - Fetches user's Microsoft Calendar events
  - Headers:
    - `Authorization`: Bearer token
  - Response: Array of calendar events

- **POST** `/microsoft/calendar/events`
  - Creates a new Microsoft Teams meeting
  - Headers:
    - `Authorization`: Bearer token
  - Body:
    ```json
    {
      "summary": "Meeting Title",
      "start": "2023-04-01T10:00:00+00:00",
      "end": "2023-04-01T11:00:00+00:00",
      "attendees": ["attendee1@example.com", "attendee2@example.com"]
    }
    ```
  - Response: Created event details with Teams link

- **POST** `/microsoft/calendar/nl-create`
  - Creates an event using natural language
  - Headers:
    - `Authorization`: Bearer token
  - Body:
    ```json
    {
      "text": "Schedule a meeting with john@example.com tomorrow at 2pm for Project Discussion",
      "timezone": "America/New_York"
    }
    ```
  - Response: Created event details with Teams link

### Email Endpoints

#### Google Email
- **POST** `/gmail/send`
  - Sends an email via Gmail
  - Headers:
    - `Authorization`: Bearer token
  - Body:
    ```json
    {
      "to": "recipient@example.com",
      "cc": "cc-recipient@example.com",
      "bcc": "bcc-recipient@example.com",
      "subject": "Email Subject",
      "body": "Email body content"
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "messageId": "message-id",
      "threadId": "thread-id",
      "recipientCount": {
        "to": 1,
        "cc": 1,
        "bcc": 1
      }
    }
    ```

#### Microsoft Email
- **POST** `/microsoft/outlook/send`
  - Sends an email via Microsoft Outlook
  - Headers:
    - `Authorization`: Bearer token
  - Body:
    ```json
    {
      "to": "recipient@example.com",
      "cc": "cc-recipient@example.com",
      "bcc": "bcc-recipient@example.com",
      "subject": "Email Subject",
      "body": "Email body content"
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "messageId": "message-id",
      "recipientCount": {
        "to": 1,
        "cc": 1,
        "bcc": 1
      }
    }
    ```

### Natural Language Processing Endpoints

- **POST** `/llm/process`
  - Processes natural language requests for meetings or emails
  - Headers:
    - `Authorization`: Bearer token
  - Body:
    ```json
    {
      "input": "Send an email to john@example.com cc marketing@example.com about the project update",
      "type": "email",
      "userTimezone": "America/New_York",
      "provider": "google"
    }
    ```
  - Response: Structured data for creating a meeting or sending an email

## 🏛️ Architecture

The application follows a modular architecture:

```
src/
├── client/             # Frontend assets
│   ├── index.html      # Main HTML template
│   ├── styles.css      # CSS styles
│   └── script.js       # Client-side JavaScript
├── core/               # Core modules
│   ├── auth.js         # Authentication management
│   ├── database.js     # Database connection
│   └── server.js       # Server setup
├── llm/                # Natural Language Processing
│   ├── routes.js       # LLM API routes
│   └── service.js      # LLM processing service
├── middleware/         # Middleware functions
│   └── auth.js         # Authentication middleware
├── plugins/            # Service integrations
│   ├── google-services/   # Google service modules
│   │   ├── api.js         # Google API client
│   │   ├── index.js       # Plugin registration
│   │   └── tools.js       # Google service tools
│   └── microsoft-services/  # Microsoft service modules
│       ├── api.js         # Microsoft API client
│       ├── index.js       # Plugin registration
│       └── tools.js       # Microsoft service tools
├── utils/              # Utility functions
│   └── logger.js       # Logging utility
└── index.js            # Application entry point
```

## 🧠 Natural Language Processing

The application uses Google's Gemini AI model for natural language processing, enabling users to:

1. **Schedule meetings** by describing them in natural language
   - Example: "Schedule a team meeting tomorrow at 3 PM EST with john@example.com and sarah@example.com for project review"

2. **Send emails** by describing them in natural language
   - Example: "Send an email to marketing@example.com cc boss@example.com with subject 'Campaign Update' saying that the latest numbers look great and we're on track to exceed our goals"

### NLP Implementation

- **Meeting Processing**
  - Extracts meeting title, time, date, and attendees
  - Detects timezone information (e.g., EST, IST)
  - Handles relative time expressions ("tomorrow", "next Monday")
  - Creates properly formatted calendar events

- **Email Processing**
  - Identifies primary recipients, CC, and BCC fields
  - Extracts subject and body content
  - Validates email addresses
  - Creates properly formatted email structure

## 🛠️ Tech Stack

- **Backend**
  - Node.js
  - Hapi.js (server framework)
  - PostgreSQL (database)
  - JSON Web Tokens (authentication)
  - Google Gemini (AI/NLP model)
  - Luxon (datetime handling)

- **Frontend**
  - HTML5
  - CSS3 (with modern features)
  - JavaScript (ES6+)
  - Font Awesome (icons)
  - Luxon (client-side datetime handling)

- **APIs & Services**
  - Google Calendar API
  - Google Gmail API
  - Microsoft Graph API
  - Google Gemini AI API

## 🆕 Recent Updates

### v1.1.0: Enhanced Email Functionality (April 2023)

- **Enhanced Email Recipient Handling**
  - Added support for CC and BCC fields in both Google and Microsoft email services
  - Implemented consistent parsing of various recipient formats (string, array, comma-separated)
  - Added validation of email addresses for all recipient types

- **Improved Email UI**
  - Added dedicated CC and BCC input fields to the email form
  - Enhanced success messages with recipient count information
  - Updated CSS for improved form layout

- **Enhanced Natural Language Email Processing**
  - Improved prompt engineering for better extraction of CC and BCC recipients
  - Added robust validation and formatting for all recipient types
  - Enhanced error handling for malformed addresses

- **Technical Improvements**
  - Refactored `sendEmail` and `sendGmail` functions to properly handle multiple recipient types
  - Added recipient count tracking for both Microsoft and Google email services
  - Updated email header formatting for Gmail to include CC and BCC fields
  - Enhanced error handling and logging for email sending operations

- **UI/UX Improvements**
  - Modern, polished visual design with premium UI elements
  - Enhanced responsive layouts and animations
  - Improved feedback for user actions
  - Dark/light mode support
  - Better input validation and error messaging

