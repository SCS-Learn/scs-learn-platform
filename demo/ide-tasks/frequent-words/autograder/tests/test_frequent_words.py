import unittest

from gradescope_utils.autograder_utils.decorators import number, partial_credit, visibility, weight

from frequent_words import frequent_words


class TestFrequentWords(unittest.TestCase):
    @weight(3)
    @number("3.1")
    def test_sample_dataset(self):
        """Sample dataset: most frequent 4-mers"""
        result = frequent_words("ACGTTGCATGTCGCATGATGCATGAGAGCT", 4)
        self.assertEqual(sorted(result), ["CATG", "GCAT"])

    @weight(1)
    @number("3.2")
    def test_no_duplicates(self):
        """Each frequent word is listed once"""
        result = frequent_words("AAAAAA", 2)
        self.assertEqual(sorted(result), ["AA"])

    @partial_credit(4)
    @number("3.3")
    @visibility("hidden")
    def test_several_genomes(self, set_score=None):
        """Hidden: five more datasets, partial credit per dataset"""
        cases = [
            ("TGGTAGCGACGTTGGTCCCGCCGCTTGAGAATCTGGATGAACATAAGCTCCCACTTGGCTTATTCAGAGAACTGGTCAACACTTGTCTCTCCCAGCCAGGTCTGACCACCGGGCAACTTTTAGAGCACTATCGTGGTACAAATAATGCTGCCAC", 3, ["TGG"]),
            ("CGGAGGACTCTAGGTAACGCTTATCAGGTCCATAGGACATTCA", 3, ["AGG"]),
            ("GATCCAGATCCCCATAC", 2, ["CC"]),
            ("ATACAATTACAGTCTGGAACCGGATGAACTGGCCGCAGGTTAACAACAGAGTTGCCAGGCACTGCCGCTGACCAGCAACAACAACAATGACTTTGACGCGAAGGGGATGGCATGAGCGAACTGATCGTCAGCCGTCAGCAACGAGTATTGTTGCTGACCCTTAACAATCCCGCCGCACGTAATGCGCTAACTAATGCCCTGCTG", 5, ["AACAA"]),
            ("CCAGCGGGGGTTGATGCTCTGGGGGTCACAAGATTGCATTTTTATGGGGTTGCAAAAATGTTTTTTACGGCAGATTCATTTAAAATGCCCACTGGCTGGAGACATAGCCCGGATGCGCGTCTTTTACAACGTATTGCGGGGTAAAATCGTAGATGTTTTAAAATAGGCGTAAC", 5, ["AAAAT", "GGGGT", "TTTTA"]),
        ]
        passed = 0
        for text, k, expected in cases:
            try:
                if sorted(frequent_words(text, k)) == sorted(expected):
                    passed += 1
            except Exception:
                pass
        set_score(4 * passed / len(cases))
        self.assertEqual(passed, len(cases), f"{passed} of {len(cases)} datasets correct")
