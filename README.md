# Instant Git Deploy

A fully automated deployment pipeline that takes a GitHub repository URL, builds the project inside AWS ECS, and serves the built files dynamically using a reverse proxy.

## Features
- **Automated Deployment**: Create projects, execute builds, and upload files with minimal manual intervention.
- **Secure Build Execution**: Validates build commands to prevent malicious execution.
- **Real-time Logging**: Uses Redis Pub/Sub for real-time updates on deployment progress.
- **Reverse Proxy-Based Serving**: Dynamically serves build files based on the subdomain provided by the user.
- **AWS Integration**: Utilizes ECS for containerized builds and S3 for storing and serving built files.

## Tech Stack
- **Backend**: Node.js, Express, Prisma, PostgreSQL
- **Infrastructure**: AWS (ECS, S3), Redis
- **Reverse Proxy**: Node.js-based proxy server

## Installation

```bash
# Clone the repository
git clone https://github.com/N-I-H-A-L/instant-git-deploy.git
cd instant-git-deploy

# Install dependencies
npm install

# Set up environment variables (.env file)
DATABASE_URL=your_postgres_connection_string
REDIS=your_redis_connection_string
AWS_S3_BUCKET=your_s3_bucket_name
AWS_ACCESS_KEY=your_aws_access_key
AWS_SECRET_KEY=your_aws_secret_key
AWS_REGION=your_aws_region

# Run the server
npm run dev
```

## API Endpoints

### 1. Create a Project
**Endpoint:** `POST /project`

**Request Body:**
```json
{
  "repoURL": "https://github.com/N-I-H-A-L/my-vite-app"
}
```
**Response:**
```json
{
  "id": "860406b6-db00-45a0-b68a-279b074fe54d",
  "createdAt": "2025-03-16T11:00:03.547Z",
  "updatedAt": "2025-03-16T11:00:03.547Z",
  "repoURL": "https://github.com/N-I-H-A-L/my-vite-app"
}
```

### 2. Deploy a Project
**Endpoint:** `POST /deploy`

**Request Body:**
```json
{
  "projectId": "860406b6-db00-45a0-b68a-279b074fe54d",
  "subdomain": "vite-app"
}
```
**Response:**
```json
{
  "status": "queued",
  "data": {
    "projectId": "860406b6-db00-45a0-b68a-279b074fe54d",
    "url": "http://vite-app.localhost:8000"
  }
}
```

## How It Works
1. **Project Creation**: The user provides a GitHub repository URL to initialize a new project.
2. **Deployment**: The user specifies a subdomain and triggers deployment.
3. **Build Execution**: An AWS ECS task runs `npm run build`, validating commands to prevent malicious execution.
4. **File Upload**: The built files are uploaded to an S3 bucket.
5. **Reverse Proxy Serving**: A Node.js-based proxy dynamically serves the deployed website based on the user's subdomain.
6. **Real-time Logs**: Redis Pub/Sub provides live updates on the deployment process.
7. **Status Handling**: Depending on success, failure, or queue state, appropriate HTML pages are served.

## License
MIT License
