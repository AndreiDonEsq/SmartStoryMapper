import os
import json
import csv
import re
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# free api key
api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=api_key)

# open to using other models, haven't really checked pricing yet, but this one is pretty good for testing
model = genai.GenerativeModel('gemini-2.5-flash')

# Read all unique categories from the ESC-50 dataset
available_sounds = set()
with open('dataset/meta/esc50.csv', mode='r', encoding='utf-8') as file:
    reader = csv.DictReader(file)
    for row in reader:
        # Replacing underscores with spaces to make it easier for the AI to read
        clean_category = row['category'].replace('_', ' ')
        available_sounds.add(clean_category)
available_sounds = list(available_sounds)

# Read the story text from a file
with open('textToMap.txt', 'r', encoding='utf-8') as file:
    story_text = file.read()

# Split the story into individual sentences using regex
# Why? well, the LLM will forget a LOT of the story and focus on just some sentences
sentences = re.split(r'(?<=[.!?]) +', story_text.replace('\n', ' '))
sentences = [s.strip() for s in sentences if len(s.strip()) > 5]

final_audio_map = {}

print(f"Processing {len(sentences)} sentences...")

# batch the sentences into a numbered list so we only make one api call
# this avoids the 429 rate limit error on the free tier
numbered_sentences = "\n".join([f"{i}. {s}" for i, s in enumerate(sentences)])

prompt = f"""
You are an audio mapping engine.
Here is a numbered list of sentences from a story:

{numbered_sentences}

You must evaluate EVERY SINGLE SENTENCE by its number.
Does the sentence describe an action or environment that matches ONE of these exact sound labels?
{available_sounds}

Respond ONLY with a valid JSON object. 
The keys must be the sentence numbers (0 to {len(sentences)-1} as strings).
The values must be the EXACT sound label string.
If no sound matches, the value MUST be "NONE".

Do not skip any numbers. The JSON output must have exactly {len(sentences)} keys.
"""

# force gemini to return a clean json object
response = model.generate_content(
    prompt,
    generation_config=genai.GenerationConfig(
        response_mime_type="application/json",
        temperature=0.0 
    )
)

# map the numbers back to the actual sentences
raw_map = json.loads(response.text)
final_audio_map = {}

for num_str, label in raw_map.items():
    if label != "NONE" and label in available_sounds:
        idx = int(num_str)
        actual_sentence = sentences[idx]
        final_audio_map[actual_sentence] = label
        print(f"Found: {label} -> {actual_sentence[:40]}...")

output_path = 'output/story_map.json'

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(final_audio_map, f, indent=4)

print(f"\nSuccess! Mapped {len(final_audio_map)} sounds. Saved to {output_path}")