# Merkle Tree API

API service for generating and managing Merkle trees with background job processing.

## Features

- Generate Merkle trees from raw data or CSV/spreadsheet files
- Store Merkle tree data in PostgreSQL database
- Background job processing with node-resque
- Generate and retrieve proofs for specific leaves
- Check job processing status

## Endpoints

### POST /generate/raw
Generate a Merkle tree from raw array data.

**Request Body:**
```json
{
  "data": [
    ["unique_id_1", "value1", "value2"],
    ["unique_id_2", "value3", "value4"]
  ]
}
```

**Response:**
```json
{
  "job_uuid": "550e8400-e29b-41d4-a716-446655440000"
}
```

### POST /generate/file
Generate a Merkle tree from a CSV or spreadsheet file.

**Form Data:**
- `file`: CSV or spreadsheet file

**Response:**
```json
{
  "job_uuid": "550e8400-e29b-41d4-a716-446655440000"
}
```

### GET /status/:uuid
Check the status of a Merkle tree generation job.

**Response:**
```json
{
  "status": "processing",
  "root_hash": null
}
```

### GET /proof/:root_hash/:unique_id
Get the proof for a specific leaf in a Merkle tree.

**Response:**
```json
{
  "root_hash": "0x...",
  "unique_id": "unique_id_1",
  "values": ["unique_id_1", "value1", "value2"],
  "proof": ["0x...", "0x..."]
}
```

## Environment Variables

See `.env.example` for required environment variables.

## Scripts

- `npm run build` - Build TypeScript
- `npm start` - Start web server (runs migrations first)
- `npm run resque:worker` - Start resque worker
- `npm run resque:scheduler` - Start resque scheduler
