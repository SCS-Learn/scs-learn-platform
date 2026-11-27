def pattern_count(text: str, pattern: str) -> int:
    k = len(pattern)
    return sum(1 for i in range(len(text) - k + 1) if text[i:i + k] == pattern)
