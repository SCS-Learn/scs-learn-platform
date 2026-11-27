# IDE task demos

Three Python tasks from chapter 1 of *Bioinformatics Algorithms* (PatternCount,
Reverse Complement, Frequent Words). Each folder has:

| File | What it is |
| --- | --- |
| `autograder/` | A real Gradescope autograder (`setup.sh`, `run_autograder`, `run_tests.py`, `tests/`). Uploadable to Gradescope as is. |
| `autograder.zip` | That folder zipped, ready to upload in the CS Learn editor ("Replace zip"). Rebuilt by `npm run check:ide-demo`. |
| `starter.py` | What students see first. |
| `solution.py` | Reference solution, used only by the check script. Never put in the zip. |
| `prompt.html`, `task.json` | Instructions and the task's title, language, and file name. |

```bash
npm run check:ide-demo   # parse each zip, run solution (full marks) and starter (fails) with real Python
npm run seed:ide-demo    # create/rebuild the IDE-DEMO course (needs add-code-task-block.sql applied)
npm run test:code-task   # parser unit tests
```
