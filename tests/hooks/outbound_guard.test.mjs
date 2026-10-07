import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bash, decisionOf, makeProject, mcp, reasonOf, runHook } from '../fixtures/hooks/helpers.mjs';
import { channelFor, classify, splitWords } from '../../system/hooks/outbound_guard.mjs';

const DRAFT_REASON =
  'Sending is switched off (draft-only). Your draft is saved — review and send it yourself, or ask me to change your autonomy settings.';
const GMAIL = 'mcp__claude_ai_Gmail__';

function guard(project, input, opts) {
  return runHook(project, 'outbound_guard', input, opts);
}

/* ---------------- classification (pure) ---------------- */

test('splitWords handles snake, kebab and camel case', () => {
  assert.deepEqual(splitWords('send_message'), ['send', 'message']);
  assert.deepEqual(splitWords('sendMessage'), ['send', 'message']);
  assert.deepEqual(splitWords('claude_ai_Gmail'), ['claude', 'ai', 'gmail']);
  assert.deepEqual(splitWords('browser-click'), ['browser', 'click']);
});

test('servers map to channels', () => {
  const table = {
    claude_ai_Gmail: 'email',
    gmail: 'email',
    outlook: 'email',
    claude_ai_Google_Calendar: 'calendar',
    linkedin: 'linkedin',
    instagram: 'social',
    facebook: 'social',
    x: 'social',
    telegram: 'messaging',
    whatsapp: 'messaging',
    claude_ai_Slack: 'messaging',
    'plugin_product-management_slack': 'messaging',
    playwright: 'web-forms',
    adzuna: 'jobs',
    some_unknown_server: 'other',
    mcpvault: 'other',
  };
  for (const [server, channel] of Object.entries(table)) assert.equal(channelFor(server), channel, server);
});

test('outbound tools are recognised by name', () => {
  const outbound = [
    ['claude_ai_Gmail', 'send_message'],
    ['claude_ai_Gmail', 'reply'],
    ['claude_ai_Gmail', 'forward'],
    ['claude_ai_Gmail', 'send_draft'],
    ['claude_ai_Google_Calendar', 'create_event'],
    ['claude_ai_Google_Calendar', 'update_event'],
    ['claude_ai_Google_Calendar', 'delete_event'],
    ['claude_ai_Google_Calendar', 'respond_to_event'],
    ['linkedin', 'send_connection_request'],
    ['linkedin', 'connect_with_person'],
    ['linkedin', 'create_post'],
    ['instagram', 'publish_media'],
    ['x', 'post_tweet'],
    ['telegram', 'sendMessage'],
    ['slack', 'slack_send_message'],
    ['slack', 'message'],
    ['jobs', 'apply_to_job'],
    ['jobs', 'submit_application'],
    ['github', 'add_issue_comment'],
    ['some_server', 'share_document'],
    ['some_server', 'invite_user'],
    ['playwright', 'browser_submit_form'],
  ];
  for (const [server, tool] of outbound) assert.equal(classify(server, tool).outbound, true, `${server} ${tool}`);
});

test('drafts, reads and local tools are never outbound', () => {
  const quiet = [
    ['claude_ai_Gmail', 'create_draft'],
    ['claude_ai_Gmail', 'update_draft'],
    ['claude_ai_Gmail', 'delete_draft'],
    ['claude_ai_Gmail', 'list_drafts'],
    ['claude_ai_Gmail', 'search_messages'],
    ['claude_ai_Gmail', 'get_message'],
    ['claude_ai_Gmail', 'read_thread'],
    ['claude_ai_Gmail', 'list_labels'],
    ['claude_ai_Gmail', 'apply_label'],
    ['claude_ai_Gmail', 'trash_message'],
    ['claude_ai_Google_Calendar', 'list_events'],
    ['claude_ai_Google_Calendar', 'get_event'],
    ['slack', 'slack_read_channel'],
    ['slack', 'slack_get_message_replies'],
    ['linkedin', 'get_profile'],
    ['some_server', 'delete_record'],
    ['some_server', 'connect_database'],
    ['some_server', 'apply_patch'],
    ['mcpvault', 'delete_note'],
    ['mcpvault', 'write_note'],
    ['obsidian', 'post_note'],
    ['filesystem', 'write_file'],
    ['markitdown', 'convert_to_markdown'],
    ['context7', 'get_library_docs'],
    ['fetch', 'fetch'],
    ['playwright', 'browser_navigate'],
    ['playwright', 'browser_snapshot'],
    ['playwright', 'browser_take_screenshot'],
    ['playwright', 'browser_fill_form'],
    ['claude-in-chrome', 'computer'],
  ];
  for (const [server, tool] of quiet) assert.equal(classify(server, tool).outbound, false, `${server} ${tool}`);
});

test('the send_draft exception only applies to verbs that really send', () => {
  assert.equal(classify('claude_ai_Gmail', 'send_draft').outbound, true);
  assert.equal(classify('claude_ai_Gmail', 'create_draft').outbound, false);
});

test('browser clicks on submit-like elements and typing with submit are web forms', () => {
  assert.deepEqual(classify('playwright', 'browser_click', { element: 'Submit application button', ref: 'e12' }), { outbound: true, channel: 'web-forms', verb: 'submit' });
  assert.equal(classify('playwright', 'browser_click', { element: 'Send message' }).outbound, true);
  assert.equal(classify('playwright', 'browser_click', { element: 'Place order' }).outbound, true);
  assert.equal(classify('playwright', 'browser_click', { element: 'Next page link', ref: 'e3' }).outbound, false);
  assert.equal(classify('playwright', 'browser_click', { element: 'Search' }).outbound, false);
  assert.equal(classify('playwright', 'browser_click', {}).outbound, false);
  assert.equal(classify('playwright', 'browser_type', { element: 'Comment box', text: 'hi', submit: true }).outbound, true);
  assert.equal(classify('playwright', 'browser_type', { element: 'Search box', text: 'jobs', submit: false }).outbound, false);
});

/* ---------------- the hook (spawned) ---------------- */

test('draft level: Gmail send, reply and forward are denied with the draft-only explanation', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const tool of ['send_message', 'reply', 'forward']) {
    const r = guard(p, mcp(`${GMAIL}${tool}`, { to: 'prof@example.edu', body: 'hi' }));
    assert.equal(r.code, 0, tool);
    assert.equal(decisionOf(r), 'deny', tool);
    assert.equal(reasonOf(r), DRAFT_REASON, tool);
    assert.equal(r.json.hookSpecificOutput.hookEventName, 'PreToolUse');
  }
});

test('Gmail drafts and reads are never decided', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const tool of ['create_draft', 'update_draft', 'search_messages', 'get_message', 'list_drafts', 'read_thread']) {
    const r = guard(p, mcp(`${GMAIL}${tool}`, { subject: 'x' }));
    assert.equal(r.code, 0, tool);
    assert.equal(r.stdout, '', tool);
  }
});

test('other channels follow their own level', (t) => {
  const p = makeProject({ autonomy: 'approve' });
  t.after(p.cleanup);
  assert.equal(decisionOf(guard(p, mcp(`${GMAIL}send_message`))), 'ask'); // email: approve
  assert.equal(decisionOf(guard(p, mcp('mcp__claude_ai_Google_Calendar__create_event', { summary: 'x' }))), 'ask'); // calendar: approve
  assert.equal(decisionOf(guard(p, mcp('mcp__linkedin__send_connection_request'))), 'deny'); // linkedin: draft
  assert.equal(decisionOf(guard(p, mcp('mcp__plugin_x_slack__slack_send_message'))), 'ask'); // messaging: approve
  assert.equal(decisionOf(guard(p, mcp('mcp__instagram__publish_media'))), 'deny'); // social: draft
  assert.equal(decisionOf(guard(p, mcp('mcp__playwright__browser_click', { element: 'Submit' }))), 'ask'); // web-forms: approve
  assert.equal(guard(p, mcp('mcp__playwright__browser_click', { element: 'Next' })).stdout, '');
});

test('approve level asks, in plain words', (t) => {
  const p = makeProject({ autonomy: 'approve' });
  t.after(p.cleanup);
  const r = guard(p, mcp(`${GMAIL}reply`));
  assert.equal(decisionOf(r), 'ask');
  assert.match(reasonOf(r), /send an email/);
  assert.match(reasonOf(r), /approve only if/);
});

test('auto level allows only when its blueprint is in state/built.json, otherwise asks', (t) => {
  const p = makeProject({ autonomy: 'auto' });
  t.after(p.cleanup);

  const notBuilt = guard(p, mcp(`${GMAIL}send_message`));
  assert.equal(decisionOf(notBuilt), 'ask');
  assert.match(reasonOf(notBuilt), /not set up yet/);

  p.write('state/built.json', JSON.stringify(['gmail-send-approval']));
  assert.equal(decisionOf(guard(p, mcp(`${GMAIL}send_message`))), 'allow');

  p.write('state/built.json', JSON.stringify({ schema: 1, built: [{ name: 'gmail-send-approval', kind: 'blueprint' }] }));
  assert.equal(decisionOf(guard(p, mcp(`${GMAIL}send_message`))), 'allow');

  p.write('state/built.json', JSON.stringify({ 'gmail-send-approval': { built: '2026-10-07' } }));
  assert.equal(decisionOf(guard(p, mcp(`${GMAIL}reply`))), 'allow');

  p.write('state/built.json', JSON.stringify(['something-else']));
  assert.equal(decisionOf(guard(p, mcp(`${GMAIL}send_message`))), 'ask');

  p.write('state/built.json', '{ broken');
  assert.equal(decisionOf(guard(p, mcp(`${GMAIL}send_message`))), 'ask');

  // The blueprint name can be set per channel.
  p.write('config/autonomy.json', JSON.stringify({ schema: 1, default: 'draft', channels: { calendar: { level: 'auto', auto_blueprint: 'my-calendar-auto' } } }));
  p.write('state/built.json', JSON.stringify(['my-calendar-auto']));
  assert.equal(decisionOf(guard(p, mcp('mcp__claude_ai_Google_Calendar__create_event'))), 'allow');
});

test('a missing config file means draft', (t) => {
  const p = makeProject({ autonomy: false });
  t.after(p.cleanup);
  assert.equal(p.exists('config/autonomy.json'), false);
  const r = guard(p, mcp(`${GMAIL}send_message`));
  assert.equal(decisionOf(r), 'deny');
  assert.equal(reasonOf(r), DRAFT_REASON);
});

test('a channel without its own level uses the default', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  p.write('config/autonomy.json', JSON.stringify({ schema: 1, default: 'approve', channels: { email: { level: 'draft' } } }));
  assert.equal(decisionOf(guard(p, mcp(`${GMAIL}send_message`))), 'deny');
  assert.equal(decisionOf(guard(p, mcp('mcp__some_server__share_document'))), 'ask');
});

test('an unreadable or invalid config denies outbound tools (fails closed) but not reads', (t) => {
  for (const autonomy of ['corrupt', 'invalid-level']) {
    const p = makeProject({ autonomy });
    t.after(p.cleanup);
    const r = guard(p, mcp(`${GMAIL}send_message`));
    assert.equal(r.code, 0, autonomy);
    assert.equal(decisionOf(r), 'deny', autonomy);
    assert.match(reasonOf(r), /could not read your autonomy settings/, autonomy);
    assert.equal(guard(p, mcp(`${GMAIL}search_messages`)).stdout, '', autonomy);
    assert.equal(guard(p, mcp(`${GMAIL}create_draft`)).stdout, '', autonomy);
  }
  const arrayConfig = makeProject();
  t.after(arrayConfig.cleanup);
  arrayConfig.write('config/autonomy.json', '[]');
  assert.equal(decisionOf(guard(arrayConfig, mcp(`${GMAIL}send_message`))), 'deny');
});

test('a malformed payload is denied (fails closed)', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const raw of ['', 'not json', '[]', 'null', '{"tool_name":"mcp__claude_ai_Gmail__send_message","tool_input":']) {
    const r = guard(p, null, { raw });
    assert.equal(r.code, 0, JSON.stringify(raw));
    assert.equal(decisionOf(r), 'deny', JSON.stringify(raw));
    assert.match(reasonOf(r), /could not check this action/);
  }
  assert.equal(decisionOf(guard(p, {})), 'deny'); // no tool name
  assert.equal(decisionOf(guard(p, { tool_name: 'mcp__broken' })), 'deny'); // no tool part
});

test('odd tool_input for an outbound tool still gets a decision', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  assert.equal(decisionOf(guard(p, { tool_name: `${GMAIL}send_message`, tool_input: 'a string' })), 'deny');
  assert.equal(decisionOf(guard(p, { tool_name: `${GMAIL}send_message` })), 'deny');
});

test('non-MCP tools get no answer', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const input of [bash('echo hi'), { tool_name: 'Write', tool_input: { file_path: 'a', content: 'b' } }, { tool_name: 'WebFetch', tool_input: { url: 'https://example.com' } }]) {
    const r = guard(p, input);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  }
});

test('local MCP tools such as the vault server are never blocked', (t) => {
  const p = makeProject();
  t.after(p.cleanup);
  for (const name of ['mcp__mcpvault__delete_note', 'mcp__mcpvault__write_note', 'mcp__fetch__fetch', 'mcp__context7__get_library_docs']) {
    assert.equal(guard(p, mcp(name)).stdout, '', name);
  }
});

test('the guard is not switched off by dev mode', (t) => {
  const p = makeProject({ devMode: true });
  t.after(p.cleanup);
  assert.equal(decisionOf(guard(p, mcp(`${GMAIL}send_message`))), 'deny');
});
