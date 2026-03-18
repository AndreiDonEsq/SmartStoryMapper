import os
import json
import csv
import re
import random
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# free api key
api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=api_key)

model = genai.GenerativeModel('gemini-2.5-flash')

# map categories to all their available filenames
category_to_files = {}
with open('dataset/meta/esc50.csv', mode='r', encoding='utf-8') as file:
    reader = csv.DictReader(file)
    for row in reader:
        clean_category = row['category'].replace('_', ' ')
        filename = row['filename']
        
        if clean_category not in category_to_files:
            category_to_files[clean_category] = []
        category_to_files[clean_category].append(filename)

# just the category names for the AI prompt
available_sounds = list(category_to_files.keys())

with open('textToMap.txt', 'r', encoding='utf-8') as file:
    story_text = file.read()

# split into sentences
sentences = re.split(r'(?<=[.!?]) +', story_text.replace('\n', ' '))
sentences = [s.strip() for s in sentences if len(s.strip()) > 5]

# batch the sentences into a numbered list
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

response = model.generate_content(
    prompt,
    generation_config=genai.GenerationConfig(
        response_mime_type="application/json",
        temperature=0.0 
    )
)

raw_map = json.loads(response.text)
final_audio_map = {}

# map the numbers back to sentences and assign a random filename
for num_str, label in raw_map.items():
    if label != "NONE" and label in category_to_files:
        idx = int(num_str)
        actual_sentence = sentences[idx]
        
        # the magic: pick a random file from this category's list
        # is this magic? we shall see if random suffices or if we need a more deterministic approach later
        chosen_file = random.choice(category_to_files[label])
        
        # save BOTH the label and the filename as a dictionary
        final_audio_map[actual_sentence] = {
            "label": label,
            "file": chosen_file
        }
        print(f"Found: {label} -> {chosen_file} | {actual_sentence[:40]}...")

output_path = 'output/story_map.json'

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(final_audio_map, f, indent=4)

print(f"\nSuccess! Mapped {len(final_audio_map)} sounds. Saved to {output_path}")