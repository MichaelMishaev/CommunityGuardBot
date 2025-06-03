// Test script for LID support
const { jidKey } = require('../utils/jidUtils');

console.log('Testing LID Support Functions...\n');

// Test cases
const testCases = [
  // Legacy phone numbers
  { input: '972555123456', expected: '972555123456@c.us', description: 'Legacy phone number' },
  { input: '+972555123456', expected: '972555123456@c.us', description: 'Phone with +' },
  { input: '972-555-123456', expected: '972555123456@c.us', description: 'Phone with dashes' },
  
  // LID formats
  { input: 'ABC123@lid', expected: 'abc123@lid', description: 'LID format' },
  { input: 'xyz789@lid', expected: 'xyz789@lid', description: 'LID lowercase' },
  { input: 'DEF456@LID', expected: 'def456@lid', description: 'LID uppercase' },
  
  // Contact objects with LID
  { 
    input: { id: { _serialized: 'test123@lid' } }, 
    expected: 'test123@lid', 
    description: 'Contact object with LID' 
  },
  { 
    input: { _serialized: 'user456@lid' }, 
    expected: 'user456@lid', 
    description: 'Direct serialized LID' 
  },
  { 
    input: { user: 'abc789', server: 'lid' }, 
    expected: 'abc789@lid', 
    description: 'User/server format LID' 
  },
  
  // Mixed legacy and LID
  { 
    input: { id: { _serialized: '972555999888@c.us' } }, 
    expected: '972555999888@c.us', 
    description: 'Contact object legacy' 
  },
  
  // Edge cases
  { input: '', expected: '', description: 'Empty string' },
  { input: null, expected: '', description: 'Null input' },
  { input: undefined, expected: '', description: 'Undefined input' },
  { input: 'invalidformat', expected: 'invalidformat@c.us', description: 'Plain text (treated as phone)' }
];

// Run tests
let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  const result = jidKey(test.input);
  const isPass = result === test.expected;
  
  console.log(`Test ${index + 1}: ${test.description}`);
  console.log(`  Input: ${JSON.stringify(test.input)}`);
  console.log(`  Expected: ${test.expected}`);
  console.log(`  Result: ${result}`);
  console.log(`  Status: ${isPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  if (isPass) passed++;
  else failed++;
});

console.log(`\n=== Test Summary ===`);
console.log(`Total Tests: ${testCases.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success Rate: ${(passed / testCases.length * 100).toFixed(1)}%`);

// Test participant JID extraction
console.log('\n=== Testing Participant JID Extraction ===');

function getParticipantJid(participant) {
  if (participant.id?._serialized) {
    return participant.id._serialized;
  }
  if (participant._serialized) {
    return participant._serialized;
  }
  if (participant.id?.user) {
    const server = participant.id.server || 'c.us';
    return `${participant.id.user}@${server}`;
  }
  return null;
}

const participantTests = [
  {
    input: { id: { _serialized: 'user123@lid' } },
    expected: 'user123@lid',
    description: 'Participant with LID'
  },
  {
    input: { id: { user: 'abc456', server: 'lid' } },
    expected: 'abc456@lid',
    description: 'Participant with user/server LID'
  },
  {
    input: { id: { _serialized: '972555123456@c.us' } },
    expected: '972555123456@c.us',
    description: 'Legacy participant'
  }
];

participantTests.forEach((test, index) => {
  const result = getParticipantJid(test.input);
  const isPass = result === test.expected;
  
  console.log(`Participant Test ${index + 1}: ${test.description}`);
  console.log(`  Result: ${result} ${isPass ? '✅' : '❌'}`);
});

console.log('\n✅ LID Support Tests Complete');