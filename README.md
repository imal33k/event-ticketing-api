# Ticketing API

A RESTful API for managing support tickets, from creation through resolution. It supports user authentication, ticket assignment, status tracking, comments, and filtering.

## Features

- User registration and JWT-based authentication
- Create, read, update, and delete tickets
- Assign tickets to agents
- Ticket status workflow (open, in progress, resolved, closed)
- Priority levels and categories
- Comments on tickets
- Filtering, sorting, and pagination
- Role-based access control (admin, agent, customer)

## Tech Stack

Replace this section with your actual stack. Example:

- Node.js and Express
- PostgreSQL (or MongoDB)
- JWT for authentication
- Jest for testing

## Getting Started

### Prerequisites

- Node.js 18 or later
- A running database instance
- npm or yarn

### Installation

```bash
git clone https://github.com/your-username/ticketing-api.git
cd ticketing-api
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/ticketing
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=1d
```

### Run the Server

```bash
# Development
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:3000/api/v1`.

### Run Tests

```bash
npm test
```

## Authentication

Protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <your_token>
```

## API Endpoints

### Auth

| Method | Endpoint          | Description                | Access |
|--------|-------------------|----------------------------|--------|
| POST   | `/auth/register`  | Register a new user        | Public |
| POST   | `/auth/login`     | Log in and receive a token | Public |
| GET    | `/auth/me`        | Get current user profile   | Auth   |

### Tickets

| Method | Endpoint                 | Description                | Access         |
|--------|--------------------------|----------------------------|----------------|
| POST   | `/tickets`               | Create a ticket            | Auth           |
| GET    | `/tickets`               | List tickets (filterable)  | Auth           |
| GET    | `/tickets/:id`           | Get a ticket by ID         | Auth           |
| PATCH  | `/tickets/:id`           | Update a ticket            | Owner/Agent    |
| DELETE | `/tickets/:id`           | Delete a ticket            | Admin          |
| PATCH  | `/tickets/:id/assign`    | Assign a ticket to an agent| Admin/Agent    |
| PATCH  | `/tickets/:id/status`    | Change ticket status       | Agent/Admin    |

### Comments

| Method | Endpoint                          | Description          | Access |
|--------|-----------------------------------|----------------------|--------|
| POST   | `/tickets/:id/comments`           | Add a comment        | Auth   |
| GET    | `/tickets/:id/comments`           | List comments        | Auth   |
| DELETE | `/tickets/:id/comments/:commentId`| Delete a comment     | Admin  |

## Request and Response Examples

### Register

**POST** `/auth/register`

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "StrongPassword123"
}
```

### Login

**POST** `/auth/login`

```json
{
  "email": "jane@example.com",
  "password": "StrongPassword123"
}
```

**Response**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "user": {
    "id": "u_123",
    "name": "Jane Doe",
    "role": "customer"
  }
}
```

### Create a Ticket

**POST** `/tickets`

```json
{
  "title": "Unable to reset password",
  "description": "The reset link in my email returns a 404 error.",
  "priority": "high",
  "category": "account"
}
```

**Response** `201 Created`

```json
{
  "id": "t_456",
  "title": "Unable to reset password",
  "description": "The reset link in my email returns a 404 error.",
  "priority": "high",
  "category": "account",
  "status": "open",
  "createdBy": "u_123",
  "assignedTo": null,
  "createdAt": "2026-10-08T10:30:00Z"
}
```

### Update Ticket Status

**PATCH** `/tickets/t_456/status`

```json
{
  "status": "in_progress"
}
```

## Query Parameters

`GET /tickets` supports the following:

| Parameter  | Description                                   | Example                  |
|------------|-----------------------------------------------|--------------------------|
| `status`   | Filter by status                              | `?status=open`           |
| `priority` | Filter by priority                            | `?priority=high`         |
| `category` | Filter by category                            | `?category=billing`      |
| `assignee` | Filter by assigned agent ID                   | `?assignee=u_789`        |
| `search`   | Search title and description                  | `?search=password`       |
| `sort`     | Sort field, prefix with `-` for descending    | `?sort=-createdAt`       |
| `page`     | Page number (default 1)                       | `?page=2`                |
| `limit`    | Items per page (default 20, max 100)          | `?limit=50`              |

## Ticket Fields

| Field         | Type   | Values                                        |
|---------------|--------|-----------------------------------------------|
| `status`      | string | `open`, `in_progress`, `resolved`, `closed`   |
| `priority`    | string | `low`, `medium`, `high`, `urgent`             |
| `category`    | string | e.g. `billing`, `technical`, `account`, `other` |

## Error Handling

Errors follow a consistent format:

```json
{
  "error": {
    "code": 400,
    "message": "Validation failed",
    "details": ["title is required"]
  }
}
```

| Status Code | Meaning                              |
|-------------|--------------------------------------|
| 200         | Success                              |
| 201         | Resource created                     |
| 400         | Bad request or validation error      |
| 401         | Missing or invalid authentication    |
| 403         | Insufficient permissions             |
| 404         | Resource not found                   |
| 429         | Too many requests                    |
| 500         | Internal server error                |

## Project Structure

```
ticketing-api/
├── src/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── app.js
├── tests/
├── .env.example
├── package.json
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m "Add my feature"`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a pull request

## License

This project is licensed under the MIT License.

---

If you tell me your actual stack (language, framework, database) and your real endpoints, I can tailor this README to match your project exactly.
