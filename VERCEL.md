# Deploying to Vercel

1. Push this project to GitHub, GitLab, or Bitbucket.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Keep the detected framework as **Next.js**. The included `vercel.json` runs the standard Next.js production build.
4. Choose **Deploy**. No environment variables are required for the Yahoo Finance provider used by this version.
5. Future pushes to the production branch deploy automatically. Pull requests receive preview URLs.

You can also deploy from this folder with the Vercel CLI:

```powershell
npx vercel
npx vercel --prod
```

Market-data and news requests are made from server-side API routes. Review provider terms and rate limits before making a public, high-traffic deployment.
