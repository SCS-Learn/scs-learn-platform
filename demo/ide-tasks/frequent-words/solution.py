def frequent_words(text: str, k: int) -> list[str]:
    counts = {}
    for i in range(len(text) - k + 1):
        word = text[i:i + k]
        counts[word] = counts.get(word, 0) + 1
    if not counts:
        return []
    best = max(counts.values())
    return [word for word, count in counts.items() if count == best]
