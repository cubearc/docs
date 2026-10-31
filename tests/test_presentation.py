"""Editorial fields are explicit and must cover the actual canonical catalog."""
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / 'tools'))
import navigation


class Presentation(unittest.TestCase):
    def setUp(self):
        self.source = {
            'format_version': 1,
            'tools': {'messages': {'display_name': 'Message formats', 'summary': 'Read or encode messages.', 'aliases': []}},
            'operations': {
                'encoding.base64.decode': {'tool_id': 'messages', 'display_name': 'Read Base64', 'summary': 'Decode bytes.'},
                'encoding.base64.encode': {'tool_id': 'messages', 'display_name': 'Write Base64', 'summary': 'Encode bytes.'},
            },
        }
        self.catalog = {'operations': [{'operation': key, 'category': 'encoding'} for key in self.source['operations']]}

    def test_projection_preserves_explicit_names_and_membership(self):
        with patch.object(navigation, 'presentation_source', return_value=self.source):
            result = navigation.catalog_presentation(self.catalog)
            self.assertEqual(result['tools']['messages']['display_name'], 'Message formats')
            self.assertEqual(navigation.operation_title('encoding.base64.decode'), 'Read Base64')
            self.assertEqual(result['operations'], self.source['operations'])

    def test_missing_stale_or_incomplete_editorial_data_blocks_build(self):
        edits = [
            lambda s: s['operations'].pop('encoding.base64.decode'),
            lambda s: s['operations'].update({'unknown': s['operations']['encoding.base64.decode']}),
            lambda s: s['tools']['messages'].pop('summary'),
            lambda s: s['operations']['encoding.base64.decode'].update(tool_id='absent'),
            lambda s: s['tools'].update({'unused': s['tools']['messages']}),
            lambda s: s['tools']['messages'].update(aliases='not a list'),
        ]
        for edit in edits:
            source = copy.deepcopy(self.source)
            edit(source)
            with self.subTest(source=source), patch.object(navigation, 'presentation_source', return_value=source):
                with self.assertRaises(ValueError):
                    navigation.catalog_presentation(self.catalog)

    def test_mixed_categories_cannot_be_grouped(self):
        self.catalog['operations'][1]['category'] = 'image'
        with patch.object(navigation, 'presentation_source', return_value=self.source):
            with self.assertRaisesRegex(ValueError, 'different categories'):
                navigation.catalog_presentation(self.catalog)

    def test_reviewed_names_do_not_rely_on_articles_or_action_order(self):
        source = navigation.presentation_source()
        self.assertEqual(source['tools']['cipher.book']['display_name'], 'Book cipher')
        self.assertEqual(source['operations']['image.decode']['tool_id'], 'image.decode')
        self.assertEqual(source['operations']['image.encode']['tool_id'], 'image.encode')
        for section in ['tools', 'operations']:
            for entry in source[section].values():
                self.assertTrue(entry['display_name'][0].isupper(), entry)
                self.assertFalse(entry['display_name'].lower().startswith(('a ', 'an ')), entry)
                self.assertTrue(entry['summary'].endswith('.'), entry)

    def test_duplicate_canonical_ids_are_rejected(self):
        self.catalog['operations'].append(self.catalog['operations'][0])
        with patch.object(navigation, 'presentation_source', return_value=self.source):
            with self.assertRaisesRegex(ValueError, 'match the canonical catalog exactly'):
                navigation.catalog_presentation(self.catalog)

    def test_renamed_reference_keeps_its_previous_heading_anchor(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('presentation_site', Path(__file__).parents[1] / 'tools/site.py')
        portal = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(portal)
        page = portal.present_operation('image.decode', '# image.decode\n\nExact contract.\n')
        self.assertIn('id="decode-an-image"', page)
        self.assertIn('id="imagedecode"', page)
