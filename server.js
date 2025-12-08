// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Octokit } from "@octokit/rest";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const TOKEN  = process.env.GITHUB_TOKEN;      // Personal Access Token (secret)
const OWNER  = process.env.GITHUB_OWNER;      // e.g. 'vivek-patel'
const REPO   = process.env.GITHUB_REPO;       // e.g. 'bhagyalaxmi-reviews'
const FILE_PATH = "reviews.json";             // file path in repo
const BRANCH = process.env.GITHUB_BRANCH || "main";

if (!TOKEN || !OWNER || !REPO) {
  console.error("❌ GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO are required in .env");
  process.exit(1);
}

const octokit = new Octokit({ auth: TOKEN });

/**
 * Read file content & sha from GitHub
 */
async function readGitHubFile() {
  const response = await octokit.repos.getContent({
    owner: OWNER,
    repo: REPO,
    path: FILE_PATH,
    ref: BRANCH,
  });

  const content = Buffer.from(response.data.content, "base64").toString("utf-8");
  const sha = response.data.sha;
  return { content, sha };
}

/**
 * Write new content to GitHub file
 */
async function writeGitHubFile(newContent, sha) {
  await octokit.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path: FILE_PATH,
    message: `Update ${FILE_PATH} via API`,
    content: Buffer.from(newContent).toString("base64"),
    sha,
    branch: BRANCH,
  });
}

/**
 * GET /next-review
 * - Reads reviews.json from GitHub
 * - Picks ONE random review
 * - Removes it from the list
 * - Writes updated JSON back to GitHub
 * - Returns the selected review
 */
app.get("/next-review", async (req, res) => {
  try {
    const { content, sha } = await readGitHubFile();

    let json;
    try {
      json = JSON.parse(content);
    } catch (e) {
      return res.status(500).json({ error: "Invalid JSON format in reviews.json" });
    }

    const reviews = json.reviews || [];

    if (!Array.isArray(reviews) || reviews.length === 0) {
      return res.status(200).json({
        done: true,
        message: "No reviews left in file.",
        review: null,
      });
    }

    // pick random index
    const index = Math.floor(Math.random() * reviews.length);
    const selectedReview = reviews[index];

    // remove selected review from array
    reviews.splice(index, 1);

    const newJson = JSON.stringify({ reviews }, null, 2);

    // write back to GitHub
    await writeGitHubFile(newJson, sha);

    return res.json({
      done: false,
      review: selectedReview,
      remaining: reviews.length,
    });
  } catch (err) {
    console.error("Error in /next-review:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Optional: GET /status – see how many reviews remain
 */
app.get("/status", async (req, res) => {
  try {
    const { content } = await readGitHubFile();
    const json = JSON.parse(content);
    const reviews = json.reviews || [];
    return res.json({
      count: reviews.length,
    });
  } catch (err) {
    console.error("Error in /status:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
