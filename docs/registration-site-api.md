# Registration-site API reference

This is the API contract for the public registration website. The website only
needs the two unauthenticated endpoints documented here.

## Base URL

Use `https://api.dreamrock.co` as the production base URL. For local
development, the backend runs at `http://localhost:6942`.

The backend allows browser requests from the origin configured by
`REGISTRATION_SITE_ORIGIN`. Docker deployments default to
`https://dreamrock.co`; direct local runs default to `http://localhost:5173`.

## Check backend health

```http
GET /health
```

This endpoint performs a lightweight database check. It does not require
authentication.

Healthy response (`200`):

```json
{
  "status": "ok"
}
```

Unavailable response (`503`):

```json
{
  "status": "error"
}
```

Example:

```ts
const response = await fetch(`${API_BASE_URL}/health`);
const healthy = response.ok && (await response.json()).status === "ok";
```

The registration site should check health once when the page loads and should
not allow submission when the check fails.

## Create a registration

```http
POST /register
Content-Type: application/json
```

Request body:

```json
{
  "name": "Jordan Alvarez",
  "email": "jordan@example.com",
  "address": "123 Main St",
  "birthday": "April 12"
}
```

`name` and `email` are required. `address` is optional and may be omitted or
`null`; blank values are stored as `null`. `name` must contain 1–200
characters and `address`, when supplied, may contain up to 500 characters;
`email` must be a valid email address and may contain up to 320 characters.
Leading and trailing whitespace is removed. The email is stored in lowercase.

Example:

```ts
const response = await fetch(`${API_BASE_URL}/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name,
    email,
    address,
    birthday,
  }),
});

const body = await response.json();
```

Created response (`201`):

```json
{
  "registration": {
    "id": 42,
    "name": "Jordan Alvarez",
    "email": "jordan@example.com",
    "address": "123 Main St",
    "created_at": "2026-08-12T18:03:00.000Z"
  }
}
```

Validation failure (`400`):

```json
{
  "error": "Please provide a name and valid email address",
  "fields": {
    "email": ["A valid email is required"]
  }
}
```

The `fields` object contains field-specific validation messages when the JSON
body is valid but its values are invalid. If the request body is not valid JSON,
the response is:

```json
{
  "error": "Request body must be valid JSON"
}
```

Unexpected database failure (`500`):

```json
{
  "error": "Could not save registration"
}
```

Treat any non-`2xx` response as unsuccessful and do not show a success state to
the visitor. A successful response means the registration has been persisted.

## Create a Checkout Session

```http
POST /create-checkout-session
Content-Type: application/json
```

Request body:

```json
{
  "userId": 42,
  "plan": "monthly"
}
```

`plan` must be `once`, `monthly`, or `yearly`. The response contains a hosted
Stripe Checkout URL:

```json
{ "url": "https://checkout.stripe.com/..." }
```

The registration is marked paid only after Stripe sends a signed
`checkout.session.completed` event to `POST /webhooks/stripe`. Successful
Checkout sessions return to `/allocate-payment/`; canceled sessions return to
`/registered/`.
