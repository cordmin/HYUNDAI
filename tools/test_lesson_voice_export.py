"""Offline checks for resumable lesson exports; never calls the voice API."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import dait_voice_studio as studio

spec = importlib.util.spec_from_file_location('lesson_voice', Path(__file__).with_name('generate-lesson-voices.py'))
lesson_voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lesson_voice)


class LessonVoiceCheck(unittest.TestCase):
    def test_catalog_and_stale_transcript(self):
        data = lesson_voice.lesson_catalog('ai')
        self.assertEqual(len(data['lines']), 33)
        sky_data = lesson_voice.lesson_catalog('sky')
        self.assertEqual(len(sky_data['lines']), 45)
        line = data['lines'][0]
        changed = dict(line, text=line['text'] + ' 변경')
        self.assertNotEqual(studio.fingerprint(data, line, 'Nika'), studio.fingerprint(data, changed, 'Nika'))
        with self.assertRaises(ValueError):
            lesson_voice.lesson_catalog('../ai')

    def test_missing_or_stale_takes_are_not_exported(self):
        data = lesson_voice.lesson_catalog('ai')
        with tempfile.TemporaryDirectory() as directory, patch.object(studio, 'ROOT', Path(directory)), patch.object(studio, 'current_clip', return_value=None), patch.object(lesson_voice.subprocess, 'run') as convert:
            self.assertEqual(lesson_voice.export_clips(data), 0)
            convert.assert_not_called()
            self.assertEqual(list(Path(directory).rglob('*.m4a')), [])


if __name__ == '__main__':
    unittest.main()
