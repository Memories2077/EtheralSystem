import { FeedbackTracker } from './feedback.js';
import { SkillRegistry } from './registry.js';
import { SkillSelectionAgent } from './agent.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const __dirname = new URL('.', import.meta.url).pathname;

async function generateSkillGapsDoc(tracker: FeedbackTracker): Promise<void> {
  const gaps = tracker.getSkillGaps('open');
  if (gaps.length === 0) {
    console.log('✅ No open skill gaps detected.');
    return;
  }

  let md = '# Skill Gaps Report\n\n';
  md += `> Auto-generated from failed generation outcomes.\n\n`;
  md += `**Generated**: ${new Date().toISOString()}\n\n`;
  md += `## Open Gaps (${gaps.length})\n\n`;

  for (const gap of gaps) {
    md += `### ${gap.suggestedSkill}\n\n`;
    md += `- **ID**: \`${gap.id}\`\n`;
    md += `- **Frequency**: ${gap.frequency} occurrence(s)\n`;
    md += `- **Error Patterns**: ${gap.errorPatterns.join(', ')}\n`;
    md += `- **Spec Features**: ${gap.specProfileFeatures.join(', ') || 'none'}\n`;
    md += `- **Status**: ${gap.status}\n\n`;
    md += `**Suggestion**: Consider creating \`src/skills/patterns/${gap.suggestedSkill.replace('patterns.', '')}.md\`\n\n`;
    md += `---\n\n`;
  }

  const filePath = path.join(__dirname, '..', '..', 'SKILL_GAPS.md');
  await fs.writeFile(filePath, md, 'utf8');
  console.log(`✅ Skill gaps report written to ${filePath}`);
}

async function printDashboard(tracker: FeedbackTracker): Promise<void> {
  const all = tracker.getAllEffectiveness();
  const top = tracker.getTopSkills(10);

  console.log('\n=== Skill Effectiveness Dashboard ===\n');
  console.log('Skill Effectiveness Report:');
  console.log('┌─────────────────────────────┬──────────┬────────────┬────────────┐');
  console.log('│ Skill ID                    │ Usage    │ Success %  │ Avg Retries│');
  console.log('├─────────────────────────────┼──────────┼────────────┼────────────┤');

  for (const eff of top) {
    const successPct = (eff.bayesianSuccessRate * 100).toFixed(1);
    const retries = eff.avgRetries.toFixed(1);
    const id = eff.skillId.padEnd(27).slice(0, 27);
    console.log(`│ ${id} │ ${eff.timesUsed.toString().padEnd(8)} │ ${successPct.padEnd(10)} │ ${retries.padEnd(12)} │`);
  }

  console.log('└─────────────────────────────┴──────────┴────────────┴────────────┘');

  const openGaps = tracker.getSkillGaps('open');
  if (openGaps.length > 0) {
    console.log('\nSkill Gaps Detected:');
    for (const gap of openGaps) {
      console.log(`- ${gap.frequency} failures with "${gap.errorPatterns.join(', ')}" → consider \`${gap.suggestedSkill}\``);
    }
  }
  console.log('');
}

// CLI entry point
if (process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js')) {
  const command = process.argv[2];

  const agent = SkillSelectionAgent.getInstance({ skillsBaseDir: 'src/skills' });
  agent.initialize().then(async () => {
    const tracker = agent.getFeedbackTracker();

    if (command === 'dashboard') {
      await printDashboard(tracker);
    } else if (command === 'gaps') {
      await generateSkillGapsDoc(tracker);
    } else {
      console.log('Usage:');
      console.log('  bun src/skill-intelligence/cli.ts dashboard  # Show effectiveness dashboard');
      console.log('  bun src/skill-intelligence/cli.ts gaps      # Generate SKILL_GAPS.md');
    }
  }).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

export { printDashboard, generateSkillGapsDoc };
