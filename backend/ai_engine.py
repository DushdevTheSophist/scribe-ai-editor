import re
import urllib.request
import urllib.parse
import json
import os

# Standard list of common English stopwords for keyword extraction
STOPWORDS = {
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', "you're", "you've", "you'll", "you'd",
    'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', "she's", 'her', 'hers',
    'herself', 'it', "it's", 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which',
    'who', 'whom', 'this', 'that', "that'll", 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if',
    'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between',
    'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out',
    'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', "don't", 'should',
    "should've", 'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', "aren't", 'couldn', "couldn't",
    'didn', "didn't", 'doesn', "doesn't", 'hadn', "hadn't", 'hasn', "hasn't", 'haven', "haven't", 'isn', "isn't",
    'ma', 'mightn', "mightn't", 'mustn', "mustn't", 'needn', "needn't", 'shan', "shan't", 'shouldn', "shouldn't",
    'wasn', "wasn't", 'weren', "weren't", 'won', "won't", 'wouldn', "wouldn't"
}

def count_syllables(word: str) -> int:
    """Estimates the number of syllables in an English word."""
    word = word.lower().strip(".:;?!'\"()[]{}*_-")
    if not word or word.isnumeric():
        return 0
    if len(word) <= 3:
        return 1
    
    vowels = "aeiouy"
    count = 0
    prev_is_vowel = False
    
    for char in word:
        is_vowel = char in vowels
        if is_vowel and not prev_is_vowel:
            count += 1
        prev_is_vowel = is_vowel
        
    # Adjustments
    if word.endswith("e"):
        # Exclude silent final e
        if count > 1:
            count -= 1
            
    # Adjust for special suffix: -le
    if word.endswith("le") and len(word) > 2 and word[-3] not in vowels:
        count += 1
        
    return max(1, count)

def clean_text(text: str) -> str:
    """Removes basic markdown symbols to analyze plain text metrics."""
    # Remove headers, bullets, links, code blocks
    text = re.sub(r'#+\s+', '', text)
    text = re.sub(r'[-*+]\s+', '', text)
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    text = re.sub(r'`{3}.*?`{3}', '', text, flags=re.DOTALL)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    return text

def calculate_metrics(text: str) -> dict:
    """Calculates readability and word statistics."""
    cleaned = clean_text(text)
    
    # Split sentences by period, exclamation, question mark
    sentences = [s.strip() for s in re.split(r'[.!?]+', cleaned) if s.strip()]
    num_sentences = len(sentences)
    
    # Split into words and filter empty strings
    words = [w.strip(".,;:!?\"'()[]{}") for w in cleaned.split() if w.strip()]
    num_words = len(words)
    
    num_chars = len(cleaned)
    
    if num_words == 0:
        return {
            "words": 0,
            "sentences": 0,
            "characters": 0,
            "syllables": 0,
            "readability_score": 100.0,
            "readability_label": "Very Easy",
            "grade_level": "1st Grade",
            "reading_time_mins": 0
        }
        
    if num_sentences == 0:
        num_sentences = 1
        
    # Count total syllables
    total_syllables = sum(count_syllables(w) for w in words)
    
    # Average Sentence Length (ASL)
    asl = num_words / num_sentences
    # Average Syllables per Word (ASW)
    asw = total_syllables / num_words
    
    # Flesch Reading Ease Formula
    fre = 206.835 - (1.015 * asl) - (84.6 * asw)
    fre = max(0.0, min(100.0, fre))
    
    # Flesch-Kincaid Grade Level Formula
    fk_grade = (0.39 * asl) + (11.8 * asw) - 15.59
    fk_grade = max(0.0, fk_grade)
    
    # Determine Labels
    if fre >= 90:
        label = "Very Easy (5th Grade)"
        grade = "5th Grade or below"
    elif fre >= 80:
        label = "Easy (6th Grade)"
        grade = "6th Grade"
    elif fre >= 70:
        label = "Fairly Easy (7th Grade)"
        grade = "7th Grade"
    elif fre >= 60:
        label = "Standard (8th-9th Grade)"
        grade = "8th-9th Grade"
    elif fre >= 50:
        label = "Fairly Difficult"
        grade = "10th-12th Grade"
    elif fre >= 30:
        label = "Difficult"
        grade = "College Student"
    else:
        label = "Very Confusing / Academic"
        grade = "College Graduate"
        
    # Reading time calculation (average 200 words per minute)
    reading_time = max(1, round(num_words / 200))
    
    return {
        "words": num_words,
        "sentences": num_sentences,
        "characters": num_chars,
        "syllables": total_syllables,
        "readability_score": round(fre, 1),
        "readability_label": label,
        "grade_level": grade,
        "reading_time_mins": reading_time
    }

def extract_keywords(text: str, top_n: int = 5) -> list:
    """Extracts top N keywords based on frequency and stopword filtering."""
    cleaned = clean_text(text).lower()
    # Find all alphabetic words
    words = re.findall(r'\b[a-z]{3,15}\b', cleaned)
    
    freq = {}
    for w in words:
        if w not in STOPWORDS:
            freq[w] = freq.get(w, 0) + 1
            
    # Sort by frequency
    sorted_keywords = sorted(freq.items(), key=lambda item: item[1], reverse=True)
    return [word for word, count in sorted_keywords[:top_n]]

def local_extractive_summary(text: str, num_sentences: int = 3) -> str:
    """Generates an extractive summary using sentence keyword-scoring."""
    cleaned = clean_text(text)
    
    # Split text into original sentences (retaining capitalization and punctuation)
    # We use regex that splits but retains sentence structure
    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    if len(sentences) <= num_sentences:
        return " ".join(sentences)
        
    # Identify key words in the document
    all_words = re.findall(r'\b[a-zA-Z]{3,15}\b', cleaned.lower())
    freq = {}
    for w in all_words:
        if w not in STOPWORDS:
            freq[w] = freq.get(w, 0) + 1
            
    if not freq:
        return " ".join(sentences[:num_sentences])
        
    # Score sentences based on frequency of words they contain
    sentence_scores = []
    for idx, sentence in enumerate(sentences):
        words_in_sentence = re.findall(r'\b[a-zA-Z]{3,15}\b', sentence.lower())
        score = sum(freq.get(w, 0) for w in words_in_sentence if w in freq)
        # Normalize score by word count to avoid bias towards extremely long sentences
        word_count = max(1, len(words_in_sentence))
        normalized_score = score / word_count
        sentence_scores.append((idx, normalized_score, sentence))
        
    # Sort by score descending and take top N
    top_sentences = sorted(sentence_scores, key=lambda x: x[1], reverse=True)[:num_sentences]
    # Re-sort by original index to keep reading order
    top_sentences = sorted(top_sentences, key=lambda x: x[0])
    
    return " ".join([item[2] for item in top_sentences])

def local_smart_complete(context_text: str) -> str:
    """Fallback auto-completer that suggests logical markdown transitions or outlines."""
    context_text = context_text.strip()
    if not context_text:
        return "\n\n## Introduction\n\nWrite a brief overview of your topic here."
        
    lines = context_text.split('\n')
    last_line = lines[-1].strip() if lines else ""
    
    # Suggest next structure based on last line
    if last_line.startswith("# ") or last_line.startswith("## "):
        return "\n\nProvide some introductory text here. Use **bold terms** for key concepts, and list supporting details below:\n- First point\n- Second point"
    elif last_line.startswith("- ") or last_line.startswith("* "):
        return "\n- Add another bullet point here..."
    elif last_line.endswith(".") or last_line.endswith("?"):
        # Suggest connecting transition phrases
        transitions = [
            " Furthermore, it is important to consider how these elements interact.",
            " In addition to this, we should analyze the following key metrics:",
            " To illustrate this point, consider the following code snippet:",
            " Consequently, this approach leads to several interesting results.",
            " On the other hand, a different perspective suggests that alternative methods might offer better performance."
        ]
        import random
        return random.choice(transitions)
        
    return " This is a suggested continuation of your text. You can edit this or press 'Autocomplete' again to generate more ideas."

def call_gemini_api(prompt: str) -> str:
    """Calls the Google Gemini API using Python's standard library."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in environment.")
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    payload = {
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 800
        }
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_data = response.read().decode('utf-8')
            res_json = json.loads(res_data)
            # Extract content from response
            text = res_json['candidates'][0]['content']['parts'][0]['text']
            return text
    except Exception as e:
        return f"Error contacting Gemini API: {str(e)}"

def run_ai_task(text: str, task: str, selected_text: str = None) -> dict:
    """Dispatches a task either to Gemini API (if key available) or local logic."""
    has_api_key = "GEMINI_API_KEY" in os.environ and os.environ["GEMINI_API_KEY"].strip() != ""
    input_text = selected_text if selected_text else text
    
    if not input_text.strip() and task != "autocomplete":
        return {"result": "No text provided to analyze.", "source": "system"}
        
    if has_api_key:
        prompt = ""
        if task == "summarize":
            prompt = f"Summarize the following markdown text in 2-3 concise paragraphs. Keep it professional and preserve formatting:\n\n{input_text}"
        elif task == "simplify":
            prompt = f"Simplify and enhance the readability of the following text, while preserving markdown structures. Return ONLY the revised text:\n\n{input_text}"
        elif task == "expand":
            prompt = f"Expand the following paragraph with more relevant details, explanations, or context. Return ONLY the expanded text:\n\n{input_text}"
        elif task == "grammar":
            prompt = f"Check spelling and grammar, and optimize the style of this text. Return ONLY the corrected version, preserving markdown:\n\n{input_text}"
        elif task == "autocomplete":
            prompt = f"You are a writing co-writer. Continue writing the next logical sentence or paragraph for this document. Use markdown if appropriate. Do not repeat the context. Context:\n\n{text}"
        elif task == "outline":
            prompt = f"Generate a clean, structured outline (using headers and bullet points) for the following text:\n\n{input_text}"
        else:
            prompt = f"Improve the following text:\n\n{input_text}"
            
        try:
            ai_result = call_gemini_api(prompt)
            return {"result": ai_result, "source": "Gemini 1.5 Flash API"}
        except Exception as e:
            # Fallback to local on API failure
            pass
            
    # Local NLP fallbacks
    source = "Local NLP Engine"
    if task == "summarize":
        result = local_extractive_summary(input_text)
    elif task == "simplify":
        # simple local simplification mockup (e.g. splitting long sentences)
        result = "### Simplified Version\n\n" + "\n\n".join([s.strip() for s in re.split(r'(?<=[.!?])\s+', input_text) if len(s.strip()) > 3])
    elif task == "expand":
        result = input_text + "\n\n*Expanded Context: This section details additional parameters, implementation challenges, and expected outcomes. For a complete analysis, consider reviewing related literature and expanding key operational definitions.*"
    elif task == "grammar":
        # Basic clean-up rules
        cleaned = re.sub(r'\s+', ' ', input_text).strip()
        cleaned = re.sub(r' ,', ',', cleaned)
        cleaned = re.sub(r' \.', '.', cleaned)
        result = cleaned
    elif task == "autocomplete":
        result = local_smart_complete(text)
    elif task == "outline":
        keywords = extract_keywords(input_text, 6)
        outline_bullets = "\n".join(f"- Deep dive into **{kw.capitalize()}**" for kw in keywords)
        result = f"## Document Outline\n\n### Core Themes\n{outline_bullets}\n\n### Next Steps\n- Gather baseline metrics\n- Validate logic with team\n- Prepare release notes"
    else:
        result = input_text
        
    # Append message reminding user how to enable Gemini if they are on local fallback
    if not has_api_key:
        result += "\n\n*(Note: Set the 'GEMINI_API_KEY' environment variable in your terminal to unlock real-time Gemini AI assistance!)*"
        
    return {"result": result, "source": source}
