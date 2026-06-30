<div align="center">

# 🎹 KeyStream (Mania Game)

**A High-Performance Web-Based Rhythm Game**

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-323330?style=for-the-badge&logo=javascript&logoColor=F7DF1E)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-039BE5?style=for-the-badge&logo=Firebase&logoColor=white)

KeyStream is an ultra-smooth HTML5 Canvas rhythm game that natively supports parsing and playing `osu!mania` beatmaps directly in your browser. Engineered with zero-GC loop optimizations and a sleek *Midnight Tech* UI.

[Play Now](#) • [Report Bug](#) • [Request Feature](#)

</div>

---

## ✨ Features

- 🎵 **Native `.osz` Support**: Drag & drop any `osu!mania` beatmap file (`.osz`) to play instantly directly in the browser!
- ⚡ **Ultra-Optimized Engine**: Custom canvas rendering engine running at a flawless 60-144 FPS with `O(1)` particle management and zero Garbage Collection stutters.
- 🎨 **Midnight Tech UI**: Modern, distraction-free aesthetic with highly readable typography (`Plus Jakarta Sans` & `Inter`) and subtle soft-glow effects.
- 🎹 **Dynamic Key Modes**: Automatically detects and supports 4K, 5K, 6K, 7K, 8K, 9K, and 10K maps.
- 👗 **Custom Note Skins**: Swap between various skins (Classic, Cyberpunk, Ocean, Forest, Sunset) on the fly.
- 🏆 **Global Leaderboards**: Integrated with Firebase & Google Login to compete against players worldwide.

---

## 🎮 How to Play

1. Drag and drop any `.osz` file onto the game screen, or click the **(+)** button in the bottom right.
2. Select a song and choose your difficulty.
3. Hit the notes as they reach the judgment line using your keyboard!
4. Default keys for 4K are `D`, `F`, `J`, `K` (Can be customized via code).

---

## 🚀 Installation & Setup

Want to run your own server or contribute? Follow these steps to set up the local environment.

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- A [Firebase](https://firebase.google.com/) Project (For Authentication & Leaderboards)

### 2. Local Server Setup
Because the game uses modules and fetches files locally, you cannot just open `index.html`. You need to run the bundled server:

```bash
# Clone the repository
git clone https://github.com/masuzu2/mania_game.git
cd mania_game

# Run the local server
node server.js
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

## 🔐 Firebase Configuration

To enable **Google Login** and **Global Scores**, you must link your Firebase project:

### Step 1: Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project.
2. Navigate to **Build → Authentication** and enable **Google Sign-In**.
3. Go to **Project Settings** ⚙️ → **General** → Register a Web App `</>`.
4. Copy the generated `firebaseConfig` block.

### Step 2: Client Setup
Open `js/auth.js` and paste your config:
```javascript
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  // ...
};
```

### Step 3: Admin Setup (Critical for Security)
To verify scores and prevent cheating, the Node.js server needs Firebase Admin privileges:
1. In Firebase Console, go to **Project Settings → Service accounts**.
2. Click **Generate new private key** and download the `.json` file.
3. Rename it to `serviceAccountKey.json` and place it in the root folder.
> ⚠️ **WARNING:** Never commit `serviceAccountKey.json` to GitHub! It is ignored in `.gitignore` by default.

---

## 📁 Project Structure

```text
mania_game/
├── server.js               # Node.js Backend & API
├── index.html              # Main Entry Point
├── css/style.css           # Styling (Midnight Tech UI)
├── js/
│   ├── app.js              # State Management
│   ├── game.js             # Core Engine & Canvas Rendering
│   ├── auth.js             # Firebase Integration
│   ├── osuParser.js        # .osu File Decoder
│   ├── oszLoader.js        # .osz ZIP Extractor
│   └── ...                 # Additional utilities
└── songs/                  # Default song packs
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/masuzu2/mania_game/issues).

---

<div align="center">
  <sub>Built with ❤️ by a passionate Rhythm Gamer & Web Developer.</sub>
</div>
