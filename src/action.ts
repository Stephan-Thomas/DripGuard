import { runGitHubAction } from './github/action-runner.js';

runGitHubAction().catch(err => {
  console.error('Fatal GitHub Action error:', err);
  process.exit(1);
});
