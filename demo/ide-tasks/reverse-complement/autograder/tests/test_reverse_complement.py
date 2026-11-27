import unittest

from gradescope_utils.autograder_utils.decorators import number, visibility, weight

from reverse_complement import reverse_complement


class TestReverseComplement(unittest.TestCase):
    @weight(2)
    @number("2.1")
    def test_sample_dataset(self):
        """Sample dataset: AAAACCCGGT"""
        self.assertEqual(reverse_complement("AAAACCCGGT"), "ACCGGGTTTT")

    @weight(1)
    @number("2.2")
    def test_single_nucleotide(self):
        """A single nucleotide becomes its complement"""
        self.assertEqual(reverse_complement("G"), "C")

    @weight(1)
    @number("2.3")
    def test_reverse_palindrome(self):
        """A reverse palindrome is its own reverse complement"""
        self.assertEqual(reverse_complement("TGATCA"), "TGATCA")

    @weight(2)
    @number("2.4")
    @visibility("hidden")
    def test_dnaa_box(self):
        """Hidden: the DnaA box ATGATCAAG"""
        self.assertEqual(reverse_complement("ATGATCAAG"), "CTTGATCAT")

    @weight(2)
    @number("2.5")
    @visibility("hidden")
    def test_twice_is_identity(self):
        """Hidden: taking the reverse complement twice gives back the original"""
        text = "GATTACACATCGGCTAGCTTAGGCCAT" * 4
        self.assertEqual(reverse_complement(reverse_complement(text)), text)
