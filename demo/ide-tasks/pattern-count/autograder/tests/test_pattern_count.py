import unittest

from gradescope_utils.autograder_utils.decorators import number, visibility, weight

from pattern_count import pattern_count


class TestPatternCount(unittest.TestCase):
    @weight(2)
    @number("1.1")
    def test_sample_dataset(self):
        """Sample dataset: GCGCG contains GCG twice"""
        self.assertEqual(pattern_count("GCGCG", "GCG"), 2)

    @weight(2)
    @number("1.2")
    def test_overlapping_occurrences(self):
        """Overlapping occurrences are all counted"""
        self.assertEqual(pattern_count("ACAACTATGCATACTATCGGGAACTATCCT", "ACTAT"), 3)

    @weight(1)
    @number("1.3")
    def test_pattern_longer_than_text(self):
        """A pattern longer than the text appears 0 times"""
        self.assertEqual(pattern_count("ACG", "ACGT"), 0)

    @weight(1)
    @number("1.4")
    def test_pattern_at_the_end(self):
        """A match ending on the last letter is counted"""
        self.assertEqual(pattern_count("TTTTACG", "ACG"), 1)

    @weight(2)
    @number("1.5")
    @visibility("hidden")
    def test_runs_of_one_letter(self):
        """Hidden: long runs of a single nucleotide"""
        self.assertEqual(pattern_count("A" * 50, "AAAA"), 47)

    @weight(2)
    @number("1.6")
    @visibility("hidden")
    def test_vibrio_cholerae_ori(self):
        """Hidden: DnaA box count in a stretch of the Vibrio cholerae ori"""
        text = "ATCAATGATCAACGTAAGCTTCTAAGCATGATCAAGGTGCTCACACAGTTTATCCACAACCTGAGTGGATGACATCAAGATAGGTCGTTGTATCTCCTTCCTCTCGTACTCTCATGACCACGGAAAGATGATCAAGAGAGGATGATTTCTTGGCCATATCGCAATGAATACTTGTGACTTGTGCTTCCAATTGACATCTTCAGCGCCATATTGCGCTGGCCAAGGTGACGGAGCGGGATTACGAAAGCATGATCATGGCTGTTGTTCTGTTTATCTTGTTTTGACTGAGACTTGTTAGGATAGACGGTTTTTCATCACTGACTAGCCAAAGCCTTACTCTGCCTGACATCGACCGTAAATTGATAATGAATTTACATGCTTCCGCGACGATTTACCTCTTGATCATCGATCCGATTGAAGATCTTCAATTGTTAATTCTCTTGCCTCGACTCATAGCCATGATGAGCTCTTGATCATGTTTCCTTAACCCTCTATTTTTTACGGAAGAATGATCAAGCTGCTGCTCTTGATCATCGTTTC"
        self.assertEqual(pattern_count(text, "TGATCA"), 8)
