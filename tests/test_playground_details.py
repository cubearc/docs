"""Exact catalog/example projection and fail-closed source identity checks."""
import json
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from playground_details import write_details


class ToolDetails(unittest.TestCase):
    def setUp(self):
        self.contract = {'operation': 'encoding.base64.decode', 'operation_version': 1,
                         'limits': {'max_input_bytes': 18446744073709551615}}
        self.catalog = {'operations': [self.contract]}
        self.fixture = {'operation': self.contract['operation'], 'operation_version': 1, 'contract_sha256': 'reviewed',
                        'inputs': {'input': 'AP8='}, 'parameters': {}, 'outputs': {'output': {'base64': 'AP8='}}}
        self.identity = {key: self.fixture[key] for key in ('operation', 'operation_version', 'contract_sha256')}

    def test_projection_preserves_exact_limits_and_named_reference_values(self):
        with tempfile.TemporaryDirectory() as temporary:
            write_details(json.dumps(self.catalog), [self.fixture], [self.identity], Path(temporary))
            detail = json.loads((Path(temporary) / 'encoding.base64.decode.json').read_text())
            self.assertIn('18446744073709551615', detail['contract_json'])
            self.assertEqual(len(detail['catalog_sha256']), 64)
            self.assertEqual(detail['example']['inputs']['input'], 'AP8=')
            self.assertEqual(json.loads(detail['example']['outputs']['output']), {'base64': 'AP8='})

    def test_mismatched_or_incomplete_sources_leave_no_accepted_assets(self):
        for field, value in [('contract_sha256', 'stale'), ('operation_version', 2)]:
            changed = deepcopy(self.fixture)
            changed[field] = value
            with tempfile.TemporaryDirectory() as temporary:
                destination = Path(temporary) / 'details'
                with self.assertRaisesRegex(ValueError, 'Stale'):
                    write_details(json.dumps(self.catalog), [changed], [self.identity], destination)
                self.assertFalse(destination.exists())
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, 'exactly'):
                write_details(json.dumps(self.catalog), [], [self.identity], Path(temporary) / 'details')


if __name__ == '__main__':
    unittest.main()
