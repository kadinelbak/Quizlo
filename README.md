# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

AI Generated Readme

````markdown
# Flashcard Maker

A web-based Quizlet-style app that lets you:

- 🔍 **Generate flashcards** manually or via AI (Gemini API)  
- 📄 **Upload PDF/DOCX** files to auto-extract and generate cards  
- 💾 **Save & delete decks** in your browser (localStorage)  
- ❓ **Take quizzes** on any saved deck, with optional “escalate difficulty” mode  

---

## 🎯 Features

- **Manual flashcard entry** (Term / Definition pairs)  
- **AI generation** via Google GenAI (Gemini)  
- **Document import** (PDF, DOCX)  
- **Deck management**: save, load, delete  
- **Quiz mode**: multiple-choice quizzes, score tracking  
- **“Escalate Difficulty”**: when you delete a card, it can auto-generate a harder replacement  

---

## ⚙️ Prerequisites

- **Node.js** (v14+ recommended)  
- **npm** or **yarn**  
- A **Gemini API key** (set in `.env.local`)  

---

## 🚀 Installation

1. **Clone the repo**  
   ```bash
   git clone https://github.com/your-username/flashcard-maker.git
   cd flashcard-maker
````

2. **Install dependencies**

   ```bash
   npm install
   # or
   yarn
   ```

3. **Configure your API key**
   Create a file named `.env.local` in the project root with:

   ```env
   API_KEY=your_gemini_api_key_here
   ```

---

## 🛠 Development

Start the Vite dev server and open the app in your default browser:

```bash
npm run dev
# or
yarn dev
```

By default it runs on `http://localhost:5173` — you can change the port in `vite.config.js` if needed.

---

## 📦 Build for Production

```bash
npm run build
# or
yarn build
```

Your optimized files will be in `dist/`, ready to deploy to any static-hosting service.

---

## 💻 Windows Desktop Shortcut

We’ve included a `code.bat` script to make launching the app super easy:

1. **Double-click** `code.bat` in the project root.

   * It will run `npm run dev` and open your browser to the local URL.

2. **Create a desktop shortcut**

   * Right-click `code.bat` → **Create shortcut**.
   * Move or copy the shortcut to your desktop.
   * (Optional) Rename it or change its icon via **Properties** → **Change Icon**.

Now you can launch your flashcard app in one click!

---

## 📂 Project Structure

```
.
├── index.html
├── index.css
├── index.tsx        # Main UI + AI integration
├── quiz.ts          # Quiz logic module
├── code.bat         # Windows launcher script
├── package.json
├── .env.local       # Your Gemini API key (gitignore’d)
└── README.md
```

---

## 🔑 Environment Variables

| Variable  | Description                         |
| :-------- | :---------------------------------- |
| `API_KEY` | Your Gemini API key for GoogleGenAI |

Make sure `.env.local` is **never** committed to version control.

---

## 🤖 Usage Overview

1. **Generate**

   * Type a topic or paste `Term: Definition` pairs and click **Generate**.
   * Or upload a PDF/DOCX and click **Generate from File**.

2. **Manage Decks**

   * **Save Current Deck** → give it a name.
   * **View Saved Decks** → load or delete any deck.

3. **Quiz Mode**

   * Set number of questions (0 = all cards).
   * Toggle **Escalate Difficulty** to auto-replace deleted cards with harder ones.
   * Click **Start Quiz** and answer multiple-choice questions.

---

## 📜 License

MIT
```
```
