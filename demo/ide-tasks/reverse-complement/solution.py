def reverse_complement(pattern: str) -> str:
    pairs = {"A": "T", "T": "A", "C": "G", "G": "C"}
    return "".join(pairs[c] for c in reversed(pattern))
