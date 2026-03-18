This Python script uses the **Gemini 2.5 Flash API** to read a story sentence-by-sentence and map it to environmental audio files. 

1. It reads `textToMap.txt`.
2. It asks Gemini to find matching sound categories for every sentence.
3. It randomly selects a specific `.wav` file for that category from the [ESC-50 Dataset](https://github.com/karolpiczak/ESC-50).
4. It outputs a clean `story_map.json` file that our future Android app can easily parse.

*Note: We use a "Smart Batching" prompt technique to process the whole story in one API call, so we never hit the free-tier rate limits!*

## 🛠️ How to run it locally

**1. Get the sounds**
Download the [ESC-50 Dataset](https://github.com/karolpiczak/ESC-50) and drop the `audio` and `meta` folders directly into a folder named `dataset/` in the root of this project.

**2. Set up the environment**
Create a virtual environment and install the requirements (mainly `google-generativeai` and `python-dotenv`).

**3. Add your API Key**
Create a `.env` file in the root directory and add your free Google AI Studio key:
`GEMINI_API_KEY=your_key_here`

**4. Map a story!**
Paste your text into `textToMap.txt` and run `mapper.py`. Check the `output/` folder for your mapped JSON!