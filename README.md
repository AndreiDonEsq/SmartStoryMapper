## 🗂️ Project Structure

* **`story-mapper-ai/`**: The Python backend. Uses the Gemini 2.5 Flash API to read text, find matching sounds via "Smart Batching", and randomly assign `.wav` files from the ESC-50 dataset.
* **`android-app/`**: The Kotlin/Jetpack Compose frontend. Reads the generated JSON, displays the interactive text, and uses Android's native `MediaPlayer` to trigger the audio.

## 🛠️ How to run it locally

**1. Get the sounds**
Download the [ESC-50 Dataset](https://github.com/karolpiczak/ESC-50).
* Drop the `audio` and `meta` folders directly into `story-mapper-ai/dataset/`.
* Drop a copy of the `audio` folder into `android-app/app/src/main/assets/` so the app can hear them.

**2. Generate a Story Map (Python)**
* Open the `story-mapper-ai/` folder.
* Create a virtual environment and install the requirements (`google-generativeai`, `python-dotenv`).
* Create a `.env` file and add your Google AI Studio key: `GEMINI_API_KEY=your_key_here`
* Paste your text into `textToMap.txt` and run `mapper.py`.
* Copy the resulting `story_map.json` and your `textToMap.txt` into the Android app's `assets/` folder.

**3. Run the App (Android Studio)**
* Open Android Studio and open the `android-app/` directory as your project.
* Let Gradle sync completely.
* Make sure your Run Configuration at the top is set to **`app`**.
* Launch an Android Virtual Device (Emulator) and hit Play!