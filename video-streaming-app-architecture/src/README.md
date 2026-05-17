# 🎬 Video Streaming App

A Bengali video streaming web app built with React, Vite, TypeScript, Firebase, and Tailwind CSS.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Backend:** Firebase (Auth + Firestore)
- **Routing:** React Router v7

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

### 2. Install dependencies

```bash
npm install
```

### 3. Setup environment variables

```bash
cp .env.example .env
```

Fill in your Firebase project credentials in `.env`.

### 4. Run locally

```bash
npm run dev
```

### 5. Build for production

```bash
npm run build
```

## Deployment

This app is configured for [Vercel](https://vercel.com) deployment.

Add all `VITE_FIREBASE_*` environment variables in your Vercel project settings before deploying.
