export type QuestionType = 'mcq';

export interface Question {
  id: string;
  type: QuestionType;
  question: string;
  imageUrl?: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export const CYBER_QUESTIONS: Question[] = [
  // 1. Art of Defending (Defense in Depth)
  {
    id: '1',
    type: 'mcq',
    question: 'You are a junior admin for an online store. It is black Friday and you suspect hackers might try to breach the network. To protect customer data, what is your first step?',
    options: [
      'Enable multiple layers: a firewall, intrusion detection, and encrypted backups.',
      'Deploy just a very expensive, brand new firewall.',
      'Hide the servers under a desk so no one finds them.',
      'Unplug the main server to ensure it cannot be hacked.'
    ],
    correctAnswer: 'Enable multiple layers: a firewall, intrusion detection, and encrypted backups.',
    explanation: 'Defense-in-depth uses multiple layers of security so if one fails, others are still able to protect you.',
    difficulty: 'easy'
  },
  {
    id: '2',
    type: 'mcq',
    question: 'You notice a suspicious login attempt on the CEO\'s email account from an unrecognized location. Following the "Art of Defending" principles, what should you do immediately?',
    options: [
      'Trigger an alert, temporarily block the login, and require the CEO to use their physical security key.',
      'Ignore it, the password was probably typed incorrectly.',
      'Email the hacker asking them to stop.',
      'Delete the CEO\'s email account permanently to be safe.'
    ],
    correctAnswer: 'Trigger an alert, temporarily block the login, and require the CEO to use their physical security key.',
    explanation: 'The Art of Defending involves continuous monitoring and proactive measures like Multi-Factor Authentication to prevent incidents.',
    difficulty: 'medium'
  },
  {
    id: '3',
    type: 'mcq',
    question: 'Your company just bought a new cloud server. The vendor says it is "unhackable." As an analyst practicing the Art of Defending, how do you handle this?',
    options: [
      'Assume it can be compromised and install anti-malware, setup network monitoring, and isolate sensitive data.',
      'Trust the vendor completely and put all confidential data on it immediately.',
      'Refuse to use the cloud server because all clouds are dangerous.',
      'Only use the server on weekends when hackers are asleep.'
    ],
    correctAnswer: 'Assume it can be compromised and install anti-malware, setup network monitoring, and isolate sensitive data.',
    explanation: 'Relying on a single security claim is risky. You must layer your own controls (Defense-in-Depth).',
    difficulty: 'hard'
  },

  // 2. Confidentiality
  {
    id: '4',
    type: 'mcq',
    question: 'You are working at a hospital processing patient records. A doctor urgently asks you to email a patient\'s medical file to their personal Gmail. How do you maintain Confidentiality?',
    options: [
      'Send it through the hospital\'s encrypted secure portal and require a password.',
      'Attach it to a regular email but tell them not to share it.',
      'Print it out and leave it on the receptionist\'s desk.',
      'Send it via a text message.'
    ],
    correctAnswer: 'Send it through the hospital\'s encrypted secure portal and require a password.',
    explanation: 'Confidentiality is about hiding sensitive information from unauthorized access, ensuring only the right people can read it.',
    difficulty: 'easy'
  },
  {
    id: '5',
    type: 'mcq',
    question: 'You are setting up a database for HR containing employee salaries. To protect this data if the server is physically stolen, what must you do?',
    options: [
      'Encrypt the database at rest so the data is unreadable without the decryption key.',
      'Change the database file name to "vacation_photos.zip".',
      'Make sure the server room has a lock on the door.',
      'Make backups of the database every day.'
    ],
    correctAnswer: 'Encrypt the database at rest so the data is unreadable without the decryption key.',
    explanation: 'Encryption protects the privacy of the data even if the physical storage falls into the wrong hands.',
    difficulty: 'medium'
  },
  {
    id: '6',
    type: 'mcq',
    question: 'You are presenting a highly confidential quarterly earnings report in a glass-walled conference room. People are walking by. How do you protect confidentiality?',
    options: [
      'Apply a privacy screen to the monitor and close the blinds.',
      'Speak very quietly so no one hears you.',
      'Make the font size much smaller.',
      'Lock the conference room door but leave the screens visible.'
    ],
    correctAnswer: 'Apply a privacy screen to the monitor and close the blinds.',
    explanation: 'Visual data breaches are a real threat. Physical controls like blinds and privacy screens protect confidentiality.',
    difficulty: 'hard'
  },

  // 3. Integrity
  {
    id: '7',
    type: 'mcq',
    question: 'You manage the payroll system. An employee calls saying their direct deposit routing number was mysteriously changed. Which security concept has been violated?',
    options: [
      'Integrity',
      'Confidentiality',
      'Availability',
      'Defense-in-Depth'
    ],
    correctAnswer: 'Integrity',
    explanation: 'Integrity ensures data hasn\'t been maliciously altered. Unauthorized changes to payroll data tamper with data integrity.',
    difficulty: 'easy'
  },
  {
    id: '8',
    type: 'mcq',
    question: 'You are sending a software update to millions of users. How can you prove to their computers that the update hasn\'t been tampered with by a hacker?',
    options: [
      'Sign the update with a cryptographic digital signature (a hash).',
      'Send an email to everyone promising it is safe.',
      'Zip the file with a password.',
      'Send the file over an unencrypted FTP connection.'
    ],
    correctAnswer: 'Sign the update with a cryptographic digital signature (a hash).',
    explanation: 'Digital signatures and hashes act as a tamper-evident seal, verifying that data remains unchanged and accurate.',
    difficulty: 'medium'
  },
  {
    id: '9',
    type: 'mcq',
    question: 'A malicious insider tries to quietly alter the logs of a server to hide the fact they downloaded sensitive files. What mechanism ensures Integrity of the logs?',
    options: [
      'Write-once-read-many (WORM) storage and hash-chaining the log entries.',
      'Storing the logs in a hidden folder on the C: drive.',
      'Renaming the log files every 24 hours.',
      'Relying on the Honor System.'
    ],
    correctAnswer: 'Write-once-read-many (WORM) storage and hash-chaining the log entries.',
    explanation: 'WORM storage prevents anyone, even admins, from altering historical records, preserving perfect integrity.',
    difficulty: 'hard'
  },

  // 4. Availability
  {
    id: '10',
    type: 'mcq',
    question: 'It’s launch day for your new video game. Suddenly, millions of fake requests flood your servers, causing them to crash. Legitimate players cannot log in. What concept failed?',
    options: [
      'Availability',
      'Authentication',
      'Confidentiality',
      'Integrity'
    ],
    correctAnswer: 'Availability',
    explanation: 'Availability means that systems and data are accessible to authorized users. A Denial of Service (DoS) attack makes the system unavailable.',
    difficulty: 'easy'
  },
  {
    id: '11',
    type: 'mcq',
    question: 'A severe thunderstorm knocks out power to your company\'s primary data center. How do you ensure Availability of your customer-facing website?',
    options: [
      'Failover to a backup server located in a different geographical region.',
      'Wait for the power company to fix the lines.',
      'Post a message on Twitter apologizing for the outage.',
      'Turn off the firewall to let traffic in faster.'
    ],
    correctAnswer: 'Failover to a backup server located in a different geographical region.',
    explanation: 'Redundancy and disaster recovery plans ensure the system remains available even during physical disasters.',
    difficulty: 'medium'
  },
  {
    id: '12',
    type: 'mcq',
    question: 'Ransomware has encrypted your company\'s main file server. The hackers demand Bitcoin for the decryption key. How do you restore Availability without paying?',
    options: [
      'Wipe the infected servers and restore the data from isolated, offline backups.',
      'Pay the ransom and hope they give you the key.',
      'Try to guess the decryption password.',
      'Abandon the server and start a brand new company.'
    ],
    correctAnswer: 'Wipe the infected servers and restore the data from isolated, offline backups.',
    explanation: 'Having offline, immutable backups guarantees you can recover your data and restore availability without giving in to extortion.',
    difficulty: 'hard'
  },

  // 5. Authentication
  {
    id: '13',
    type: 'mcq',
    question: 'You are setting up a secure portal for remote workers. Users keep using weak passwords like "password123". How do you strengthen Authentication?',
    options: [
      'Require them to enter a code sent to their phone in addition to their password.',
      'Make them type the weak password twice to be sure.',
      'Ban passwords completely and let anyone log in.',
      'Ask them nicely to use longer passwords.'
    ],
    correctAnswer: 'Require them to enter a code sent to their phone in addition to their password.',
    explanation: 'Adding Multi-Factor Authentication (MFA) requires "something they have" (a phone) alongside "something they know" (password).',
    difficulty: 'easy'
  },
  {
    id: '14',
    type: 'mcq',
    question: 'An employee lost their badge, which they use to tap into the building. A stranger picks it up and tries to enter. How do you enforce Authentication to stop them?',
    options: [
      'Require a PIN code or biometric scan after tapping the badge.',
      'Rely entirely on the badge tap for entry.',
      'Put up a sign saying "Authorized Personnel Only".',
      'Leave the door unlocked so they don\'t need the badge.'
    ],
    correctAnswer: 'Require a PIN code or biometric scan after tapping the badge.',
    explanation: 'Combining "something you have" (a badge) with "something you know" (a PIN) or "are" (biometric scan) creating multi-factor authentication.',
    difficulty: 'medium'
  },
  {
    id: '15',
    type: 'mcq',
    question: 'A hacker is trying to impersonate the company\'s database server by returning a fake IP address to client requests. How does the client Authenticate the real server?',
    options: [
      'By verifying the server\'s digital certificate issued by a trusted Certificate Authority (CA).',
      'By asking the server if it is a hacker.',
      'By checking if the server replies quickly enough.',
      'By sending a ping request.'
    ],
    correctAnswer: 'By verifying the server\'s digital certificate issued by a trusted Certificate Authority (CA).',
    explanation: 'Digital certificates verify the identity of servers (Authentication) using cryptography to prevent impersonation.',
    difficulty: 'hard'
  }
];
