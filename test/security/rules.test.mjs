import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'wrozo-emulator-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

describe('Group A: Role Security (SEC-01)', () => {
  test('A1: unauthenticated user cannot read or write user documents', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('users').doc('worker1').get());
    await assertFails(db.collection('users').doc('worker1').set({ phone: '+1234567890', status: 'ACTIVE', createdAt: new Date() }));
  });

  test('A2: user cannot create document with role in the initial payload', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    // SEC-01: keys().hasOnly(['phone', 'status', 'createdAt'])
    await assertFails(db.collection('users').doc('worker1').set({
      phone: '+1234567890',
      status: 'ACTIVE',
      createdAt: new Date(),
      role: 'WORKER',
    }));
  });

  test('A3: user cannot create document for another user uid', async () => {
    const db = testEnv.authenticatedContext('attacker').firestore();
    await assertFails(db.collection('users').doc('victim').set({
      phone: '+1234567890',
      status: 'ACTIVE',
      createdAt: new Date(),
    }));
  });

  test('A4: user can create valid initial user document without role', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(db.collection('users').doc('worker1').set({
      phone: '+1234567890',
      status: 'ACTIVE',
      createdAt: new Date(),
    }));
  });

  test('A5: initial role assignment of WORKER succeeds when role is currently absent', async () => {
    // Seed initial user document without role
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('users').doc('worker1').set({
        phone: '+1234567890',
        status: 'ACTIVE',
        createdAt: new Date(),
      });
    });

    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(db.collection('users').doc('worker1').update({
      role: 'WORKER',
    }));
  });

  test('A6: initial role assignment of CONTRACTOR succeeds when role is currently absent', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('users').doc('contractor1').set({
        phone: '+1234567891',
        status: 'ACTIVE',
        createdAt: new Date(),
      });
    });

    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertSucceeds(db.collection('users').doc('contractor1').update({
      role: 'CONTRACTOR',
    }));
  });

  test('A7: initial role assignment of ADMIN is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('users').doc('attacker1').set({
        phone: '+1234567892',
        status: 'ACTIVE',
        createdAt: new Date(),
      });
    });

    const db = testEnv.authenticatedContext('attacker1').firestore();
    await assertFails(db.collection('users').doc('attacker1').update({
      role: 'ADMIN',
    }));
  });

  test('A8: existing WORKER cannot change role to CONTRACTOR', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('users').doc('worker1').set({
        phone: '+1234567890',
        status: 'ACTIVE',
        createdAt: new Date(),
        role: 'WORKER',
      });
    });

    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('users').doc('worker1').update({
      role: 'CONTRACTOR',
    }));
  });

  test('A9: existing CONTRACTOR cannot change role to WORKER', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('users').doc('contractor1').set({
        phone: '+1234567891',
        status: 'ACTIVE',
        createdAt: new Date(),
        role: 'CONTRACTOR',
      });
    });

    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(db.collection('users').doc('contractor1').update({
      role: 'WORKER',
    }));
  });

  test('A10: existing WORKER cannot escalate to ADMIN', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('users').doc('worker1').set({
        phone: '+1234567890',
        status: 'ACTIVE',
        createdAt: new Date(),
        role: 'WORKER',
      });
    });

    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('users').doc('worker1').update({
      role: 'ADMIN',
    }));
  });

  test('A11: user can update fcmTokens without modifying role', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('users').doc('worker1').set({
        phone: '+1234567890',
        status: 'ACTIVE',
        createdAt: new Date(),
        role: 'WORKER',
      });
    });

    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(db.collection('users').doc('worker1').update({
      fcmTokens: ['token_abc_123'],
    }));
  });
});

describe('Group B: Payment Security (SEC-02)', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('payments').doc('pay_001').set({
        workerId: 'worker1',
        contractorId: 'contractor1',
        amount: 25000,
        status: 'PENDING',
        createdAt: new Date(),
      });
    });
  });

  test('B1: unauthenticated user cannot read payments', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('payments').doc('pay_001').get());
  });

  test('B2: worker involved in payment can read the payment document', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(db.collection('payments').doc('pay_001').get());
  });

  test('B3: contractor involved in payment can read the payment document', async () => {
    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertSucceeds(db.collection('payments').doc('pay_001').get());
  });

  test('B4: third-party user cannot read other users payment document', async () => {
    const db = testEnv.authenticatedContext('stranger').firestore();
    await assertFails(db.collection('payments').doc('pay_001').get());
  });

  test('B5: client cannot create payment document (PENDING or any status)', async () => {
    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(db.collection('payments').doc('pay_fake').set({
      workerId: 'worker1',
      contractorId: 'contractor1',
      amount: 50000,
      status: 'PENDING',
      createdAt: new Date(),
    }));
  });

  test('B6: client cannot update payment document (e.g. mark COMPLETED or spoof status)', async () => {
    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(db.collection('payments').doc('pay_001').update({
      status: 'COMPLETED',
    }));
  });

  test('B7: client cannot delete payment document', async () => {
    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(db.collection('payments').doc('pay_001').delete());
  });
});

describe('Group C: Profile Security (SEC-03)', () => {
  test('C1: worker profile creation with rating > 0 is denied', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('worker_profiles').doc('worker1').set({
      fullName: 'Worker One',
      rating: 4.8,
      reviewCount: 0,
      jobsCompleted: 0,
    }));
  });

  test('C2: worker profile creation with reviewCount > 0 is denied', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('worker_profiles').doc('worker1').set({
      fullName: 'Worker One',
      rating: 0,
      reviewCount: 15,
      jobsCompleted: 0,
    }));
  });

  test('C3: worker profile creation with jobsCompleted > 0 is denied', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('worker_profiles').doc('worker1').set({
      fullName: 'Worker One',
      rating: 0,
      reviewCount: 0,
      jobsCompleted: 10,
    }));
  });

  test('C4: valid worker profile creation (all metrics zero) succeeds', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(db.collection('worker_profiles').doc('worker1').set({
      fullName: 'Worker One',
      skills: ['Plumbing', 'Carpentry'],
      rating: 0,
      reviewCount: 0,
      jobsCompleted: 0,
    }));
  });

  test('C5: worker cannot update own rating, reviewCount, or jobsCompleted', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('worker_profiles').doc('worker1').set({
        fullName: 'Worker One',
        skills: ['Plumbing'],
        rating: 0,
        reviewCount: 0,
        jobsCompleted: 0,
      });
    });

    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('worker_profiles').doc('worker1').update({ rating: 5.0 }));
    await assertFails(db.collection('worker_profiles').doc('worker1').update({ reviewCount: 1 }));
    await assertFails(db.collection('worker_profiles').doc('worker1').update({ jobsCompleted: 1 }));
    await assertSucceeds(db.collection('worker_profiles').doc('worker1').update({ bio: 'Experienced plumber' }));
  });

  test('C6: contractor profile creation with forged metrics is denied', async () => {
    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(db.collection('contractor_profiles').doc('contractor1').set({
      companyName: 'Acme Corp',
      rating: 5.0,
      reviewCount: 0,
      isVerified: false,
    }));
  });

  test('C7: contractor profile creation with isVerified = true is denied', async () => {
    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(db.collection('contractor_profiles').doc('contractor1').set({
      companyName: 'Acme Corp',
      rating: 0,
      reviewCount: 0,
      isVerified: true,
    }));
  });

  test('C8: valid contractor profile creation succeeds and isVerified cannot be updated by client', async () => {
    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertSucceeds(db.collection('contractor_profiles').doc('contractor1').set({
      companyName: 'Acme Corp',
      rating: 0,
      reviewCount: 0,
      isVerified: false,
    }));

    await assertFails(db.collection('contractor_profiles').doc('contractor1').update({
      isVerified: true,
    }));
  });
});

describe('Group D: Job & Application Security', () => {
  beforeEach(async () => {
    // Seed users with respective roles
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const fs = context.firestore();
      await fs.collection('users').doc('contractor1').set({ role: 'CONTRACTOR', status: 'ACTIVE' });
      await fs.collection('users').doc('worker1').set({ role: 'WORKER', status: 'ACTIVE' });
      await fs.collection('users').doc('stranger').set({ role: 'WORKER', status: 'ACTIVE' });

      // Seed an OPEN job
      await fs.collection('jobs').doc('job_101').set({
        contractorId: 'contractor1',
        title: 'Fix pipes',
        status: 'OPEN',
        createdAt: new Date(),
      });
    });
  });

  test('D1: worker cannot create a job', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('jobs').doc('job_102').set({
      contractorId: 'worker1',
      title: 'Illegal Job',
      status: 'OPEN',
      createdAt: new Date(),
    }));
  });

  test('D2: contractor can create an OPEN job', async () => {
    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertSucceeds(db.collection('jobs').doc('job_102').set({
      contractorId: 'contractor1',
      title: 'Painting project',
      status: 'OPEN',
      createdAt: new Date(),
    }));
  });

  test('D3: unauthenticated user cannot create application', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('applications').doc('job_101_worker1').set({
      jobId: 'job_101',
      workerId: 'worker1',
      contractorId: 'contractor1',
      status: 'PENDING',
      createdAt: new Date(),
    }));
  });

  test('D4: worker can apply to job with composite ID and PENDING status', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(db.collection('applications').doc('job_101_worker1').set({
      jobId: 'job_101',
      workerId: 'worker1',
      contractorId: 'contractor1',
      status: 'PENDING',
      createdAt: new Date(),
    }));
  });

  test('D5: application with non-composite ID is denied', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('applications').doc('random_doc_id').set({
      jobId: 'job_101',
      workerId: 'worker1',
      contractorId: 'contractor1',
      status: 'PENDING',
      createdAt: new Date(),
    }));
  });

  test('D6: application cannot be created directly in ACCEPTED status', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('applications').doc('job_101_worker1').set({
      jobId: 'job_101',
      workerId: 'worker1',
      contractorId: 'contractor1',
      status: 'ACCEPTED',
      createdAt: new Date(),
    }));
  });

  test('D7: contractor cannot create an application as a worker', async () => {
    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(db.collection('applications').doc('job_101_contractor1').set({
      jobId: 'job_101',
      workerId: 'contractor1',
      contractorId: 'contractor1',
      status: 'PENDING',
      createdAt: new Date(),
    }));
  });

  test('D8: worker can withdraw their own application', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('applications').doc('job_101_worker1').set({
        jobId: 'job_101',
        workerId: 'worker1',
        contractorId: 'contractor1',
        status: 'PENDING',
        createdAt: new Date(),
      });
    });

    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(db.collection('applications').doc('job_101_worker1').update({
      status: 'WITHDRAWN',
    }));
  });

  test('D9: contractor can accept application', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('applications').doc('job_101_worker1').set({
        jobId: 'job_101',
        workerId: 'worker1',
        contractorId: 'contractor1',
        status: 'PENDING',
        createdAt: new Date(),
      });
    });

    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertSucceeds(db.collection('applications').doc('job_101_worker1').update({
      status: 'ACCEPTED',
    }));
  });

  test('D10: client cannot delete application document', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('applications').doc('job_101_worker1').set({
        jobId: 'job_101',
        workerId: 'worker1',
        contractorId: 'contractor1',
        status: 'PENDING',
        createdAt: new Date(),
      });
    });

    const dbWorker = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(dbWorker.collection('applications').doc('job_101_worker1').delete());

    const dbContractor = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(dbContractor.collection('applications').doc('job_101_worker1').delete());
  });
});

describe('Group E: Review Security', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('reviews').doc('job_101_contractor1').set({
        jobId: 'job_101',
        reviewerId: 'contractor1',
        revieweeId: 'worker1',
        rating: 5,
        comment: 'Excellent work',
        createdAt: new Date(),
      });
    });
  });

  test('E1: unauthenticated user cannot write review', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('reviews').doc('job_102_anon').set({
      jobId: 'job_102',
      reviewerId: 'anon',
      revieweeId: 'worker1',
      rating: 5,
    }));
  });

  test('E2: authenticated user can submit valid review with composite ID', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(db.collection('reviews').doc('job_101_worker1').set({
      jobId: 'job_101',
      reviewerId: 'worker1',
      revieweeId: 'contractor1',
      rating: 4.5,
      comment: 'Prompt payment, great contractor',
      createdAt: new Date(),
    }));
  });

  test('E3: user cannot review themselves (reviewerId == revieweeId)', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('reviews').doc('job_101_worker1').set({
      jobId: 'job_101',
      reviewerId: 'worker1',
      revieweeId: 'worker1',
      rating: 5,
      comment: 'I am the best',
      createdAt: new Date(),
    }));
  });

  test('E4: review with rating < 1 is denied', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('reviews').doc('job_101_worker1').set({
      jobId: 'job_101',
      reviewerId: 'worker1',
      revieweeId: 'contractor1',
      rating: 0,
      comment: 'Terrible',
      createdAt: new Date(),
    }));
  });

  test('E5: review with rating > 5 is denied', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('reviews').doc('job_101_worker1').set({
      jobId: 'job_101',
      reviewerId: 'worker1',
      revieweeId: 'contractor1',
      rating: 6,
      comment: 'Off the charts',
      createdAt: new Date(),
    }));
  });

  test('E6: review with non-composite ID is denied', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(db.collection('reviews').doc('arbitrary_review_id').set({
      jobId: 'job_101',
      reviewerId: 'worker1',
      revieweeId: 'contractor1',
      rating: 5,
      comment: 'Valid content, bad ID',
      createdAt: new Date(),
    }));
  });

  test('E7: existing review cannot be updated (immutable)', async () => {
    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(db.collection('reviews').doc('job_101_contractor1').update({
      rating: 1,
      comment: 'Retaliatory edit',
    }));
  });

  test('E8: existing review cannot be deleted', async () => {
    const db = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(db.collection('reviews').doc('job_101_contractor1').delete());
  });

  test('E9: authenticated user can read reviews', async () => {
    const db = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(db.collection('reviews').doc('job_101_contractor1').get());
  });
});

describe('Group F: Chat Security', () => {
  const convId = 'contractor1_worker1'; // sorted: contractor1 < worker1

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const fs = context.firestore();

      // Seed users
      await fs.collection('users').doc('worker1').set({ role: 'WORKER', status: 'ACTIVE' });
      await fs.collection('users').doc('contractor1').set({ role: 'CONTRACTOR', status: 'ACTIVE' });
      await fs.collection('users').doc('stranger').set({ role: 'WORKER', status: 'ACTIVE' });

      // Seed an ACCEPTED application between contractor1 and worker1
      await fs.collection('applications').doc('job_101_worker1').set({
        jobId: 'job_101',
        workerId: 'worker1',
        contractorId: 'contractor1',
        status: 'ACCEPTED',
        createdAt: new Date(),
      });

      // Seed a REJECTED application between contractor1 and stranger
      await fs.collection('applications').doc('job_101_stranger').set({
        jobId: 'job_101',
        workerId: 'stranger',
        contractorId: 'contractor1',
        status: 'REJECTED',
        createdAt: new Date(),
      });

      // Seed an active conversation between contractor1 and worker1
      await fs.collection('conversations').doc(convId).set({
        participants: ['contractor1', 'worker1'],
        applicationId: 'job_101_worker1',
        lastMessage: 'Welcome to the team',
        lastMessageAt: new Date(),
        unreadCount: { contractor1: 0, worker1: 0 },
        createdAt: new Date(),
      });

      // Seed an existing message
      await fs.collection('conversations').doc(convId).collection('messages').doc('msg_001').set({
        senderId: 'contractor1',
        text: 'Welcome to the team',
        createdAt: new Date(),
        isRead: false,
      });
    });
  });

  test('F1: participant can read own conversation', async () => {
    const dbWorker = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(dbWorker.collection('conversations').doc(convId).get());

    const dbContractor = testEnv.authenticatedContext('contractor1').firestore();
    await assertSucceeds(dbContractor.collection('conversations').doc(convId).get());
  });

  test('F2: non-participant cannot read conversation', async () => {
    const dbStranger = testEnv.authenticatedContext('stranger').firestore();
    await assertFails(dbStranger.collection('conversations').doc(convId).get());

    const dbAnon = testEnv.unauthenticatedContext().firestore();
    await assertFails(dbAnon.collection('conversations').doc(convId).get());
  });

  test('F3: participant can read messages in conversation', async () => {
    const dbWorker = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(dbWorker.collection('conversations').doc(convId).collection('messages').doc('msg_001').get());

    const dbContractor = testEnv.authenticatedContext('contractor1').firestore();
    await assertSucceeds(dbContractor.collection('conversations').doc(convId).collection('messages').doc('msg_001').get());
  });

  test('F4: non-participant cannot read messages in conversation', async () => {
    const dbStranger = testEnv.authenticatedContext('stranger').firestore();
    await assertFails(dbStranger.collection('conversations').doc(convId).collection('messages').doc('msg_001').get());

    const dbAnon = testEnv.unauthenticatedContext().firestore();
    await assertFails(dbAnon.collection('conversations').doc(convId).collection('messages').doc('msg_001').get());
  });

  test('F5: participant can send message as themselves', async () => {
    const dbWorker = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(dbWorker.collection('conversations').doc(convId).collection('messages').doc('msg_002').set({
      senderId: 'worker1',
      text: 'Thank you! Excited to start.',
      createdAt: new Date(),
      isRead: false,
    }));
  });

  test('F6: participant cannot spoof senderId as another UID', async () => {
    const dbWorker = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(dbWorker.collection('conversations').doc(convId).collection('messages').doc('msg_spoof').set({
      senderId: 'contractor1', // spoofing peer
      text: 'I am impersonating the contractor',
      createdAt: new Date(),
      isRead: false,
    }));
  });

  test('F7: non-participant cannot send message in conversation', async () => {
    const dbStranger = testEnv.authenticatedContext('stranger').firestore();
    await assertFails(dbStranger.collection('conversations').doc(convId).collection('messages').doc('msg_intruder').set({
      senderId: 'stranger',
      text: 'Unauthorized message',
      createdAt: new Date(),
      isRead: false,
    }));
  });

  test('F8: empty message text is denied', async () => {
    const dbWorker = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(dbWorker.collection('conversations').doc(convId).collection('messages').doc('msg_empty').set({
      senderId: 'worker1',
      text: '',
      createdAt: new Date(),
      isRead: false,
    }));
  });

  test('F9: oversized message text (>5000 chars) is denied', async () => {
    const dbWorker = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(dbWorker.collection('conversations').doc(convId).collection('messages').doc('msg_huge').set({
      senderId: 'worker1',
      text: 'A'.repeat(5001),
      createdAt: new Date(),
      isRead: false,
    }));
  });

  test('F10: existing message cannot be modified (immutable)', async () => {
    const dbContractor = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(dbContractor.collection('conversations').doc(convId).collection('messages').doc('msg_001').update({
      text: 'Altered message content',
    }));
  });

  test('F11: existing message cannot be deleted by client', async () => {
    const dbContractor = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(dbContractor.collection('conversations').doc(convId).collection('messages').doc('msg_001').delete());

    const dbWorker = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(dbWorker.collection('conversations').doc(convId).collection('messages').doc('msg_001').delete());
  });

  test('F12: conversation participants cannot be modified by client', async () => {
    const dbContractor = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(dbContractor.collection('conversations').doc(convId).update({
      participants: ['contractor1', 'stranger'],
    }));
  });

  test('F13: conversation applicationId cannot be modified by client', async () => {
    const dbWorker = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(dbWorker.collection('conversations').doc(convId).update({
      applicationId: 'other_application_id',
    }));
  });

  test('F14: conversation cannot be deleted by client', async () => {
    const dbContractor = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(dbContractor.collection('conversations').doc(convId).delete());
  });

  test('F15: arbitrary user cannot create conversation without accepted application', async () => {
    const dbStranger = testEnv.authenticatedContext('stranger').firestore();
    // stranger has only REJECTED application with contractor1
    const invalidConvId = 'contractor1_stranger';
    await assertFails(dbStranger.collection('conversations').doc(invalidConvId).set({
      participants: ['contractor1', 'stranger'],
      applicationId: 'job_101_stranger',
      createdAt: new Date(),
      lastMessage: 'Hello',
      lastMessageAt: new Date(),
      unreadCount: { contractor1: 1, stranger: 0 },
    }));

    // stranger has NO application with worker1
    const noAppConvId = 'stranger_worker1';
    await assertFails(dbStranger.collection('conversations').doc(noAppConvId).set({
      participants: ['stranger', 'worker1'],
      applicationId: 'non_existent_app',
      createdAt: new Date(),
      lastMessage: 'Hello',
      lastMessageAt: new Date(),
      unreadCount: { stranger: 0, worker1: 1 },
    }));
  });

  test('F16: conversation creation with non-canonical ID is denied', async () => {
    const dbWorker = testEnv.authenticatedContext('worker1').firestore();
    // Non-canonical ID: worker1_contractor1 instead of contractor1_worker1
    await assertFails(dbWorker.collection('conversations').doc('worker1_contractor1').set({
      participants: ['contractor1', 'worker1'],
      applicationId: 'job_101_worker1',
      createdAt: new Date(),
      lastMessage: 'Hello',
      lastMessageAt: new Date(),
      unreadCount: { contractor1: 1, worker1: 0 },
    }));
  });

  test('F17: legitimate worker and contractor with accepted application can create conversation and exchange messages', async () => {
    // Clean state: delete seeded conversation
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection('conversations').doc(convId).delete();
    });

    const dbWorker = testEnv.authenticatedContext('worker1').firestore();
    // Worker creates the conversation
    await assertSucceeds(dbWorker.collection('conversations').doc(convId).set({
      participants: ['contractor1', 'worker1'],
      applicationId: 'job_101_worker1',
      createdAt: new Date(),
      lastMessage: 'Hi, I saw you accepted my application!',
      lastMessageAt: new Date(),
      unreadCount: { contractor1: 1, worker1: 0 },
    }));

    // Worker sends first message in messages subcollection
    await assertSucceeds(dbWorker.collection('conversations').doc(convId).collection('messages').doc('msg_first').set({
      senderId: 'worker1',
      text: 'Hi, I saw you accepted my application!',
      createdAt: new Date(),
      isRead: false,
    }));

    // Contractor responds
    const dbContractor = testEnv.authenticatedContext('contractor1').firestore();
    await assertSucceeds(dbContractor.collection('conversations').doc(convId).collection('messages').doc('msg_reply').set({
      senderId: 'contractor1',
      text: 'Welcome aboard! When can you start?',
      createdAt: new Date(),
      isRead: false,
    }));

    // Contractor updates conversation metadata (without touching participants)
    await assertSucceeds(dbContractor.collection('conversations').doc(convId).update({
      lastMessage: 'Welcome aboard! When can you start?',
      lastMessageAt: new Date(),
      'unreadCount.worker1': 1,
      'unreadCount.contractor1': 0,
    }));
  });
});

describe('Group G: Device Token Security (SEC-FCM)', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const fs = context.firestore();
      await fs.collection('users').doc('user1').set({ phone: '+1234567890', status: 'ACTIVE', createdAt: new Date() });
      await fs.collection('users').doc('user2').set({ phone: '+1234567891', status: 'ACTIVE', createdAt: new Date() });

      // Seed an existing device token for user1
      await fs.collection('users').doc('user1').collection('device_tokens').doc('token_device_1').set({
        token: 'fcm_token_device_1',
        platform: 'android',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
  });

  test('G1: unauthenticated user cannot read or write device tokens', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('users').doc('user1').collection('device_tokens').doc('token_device_1').get());
    await assertFails(db.collection('users').doc('user1').collection('device_tokens').doc('token_anon').set({
      token: 'fcm_token_anon',
      platform: 'android',
      createdAt: new Date(),
    }));
  });

  test('G2: authenticated user can read and register device token in own subcollection', async () => {
    const dbUser1 = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(dbUser1.collection('users').doc('user1').collection('device_tokens').doc('token_device_1').get());
    await assertSucceeds(dbUser1.collection('users').doc('user1').collection('device_tokens').doc('token_device_2').set({
      token: 'fcm_token_device_2',
      platform: 'android',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  test('G3: user cannot read another users device tokens', async () => {
    const dbUser2 = testEnv.authenticatedContext('user2').firestore();
    await assertFails(dbUser2.collection('users').doc('user1').collection('device_tokens').doc('token_device_1').get());
  });

  test('G4: user cannot create or modify another users device tokens', async () => {
    const dbUser2 = testEnv.authenticatedContext('user2').firestore();
    // Tamper attempt on user1 token
    await assertFails(dbUser2.collection('users').doc('user1').collection('device_tokens').doc('token_device_1').update({
      token: 'fcm_token_hijacked',
    }));
    // Spoof attempt adding token to user1
    await assertFails(dbUser2.collection('users').doc('user1').collection('device_tokens').doc('token_spoof').set({
      token: 'fcm_token_attacker',
      platform: 'android',
      createdAt: new Date(),
    }));
  });

  test('G5: user cannot delete another users device tokens', async () => {
    const dbUser2 = testEnv.authenticatedContext('user2').firestore();
    await assertFails(dbUser2.collection('users').doc('user1').collection('device_tokens').doc('token_device_1').delete());
  });

  test('G6: user can delete their own device token', async () => {
    const dbUser1 = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(dbUser1.collection('users').doc('user1').collection('device_tokens').doc('token_device_1').delete());
  });

  test('G7: user can register multiple device tokens under their own subcollection', async () => {
    const dbUser1 = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(dbUser1.collection('users').doc('user1').collection('device_tokens').doc('phone_token').set({
      token: 'phone_fcm_token',
      platform: 'android',
      createdAt: new Date(),
    }));
    await assertSucceeds(dbUser1.collection('users').doc('user1').collection('device_tokens').doc('tablet_token').set({
      token: 'tablet_fcm_token',
      platform: 'android',
      createdAt: new Date(),
    }));
  });
});

describe('Group H: Profile Privacy & Anti-Scraping (SEC-PROFILE)', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      // Seed public worker profile
      await adminDb.collection('worker_profiles').doc('worker1').set({
        name: 'Alice Worker',
        skills: ['Plumbing', 'Carpentry'],
        expectedWage: 800,
        isAvailable: true,
        rating: 0,
        reviewCount: 0,
        jobsCompleted: 0,
        createdAt: new Date(),
      });
      // Seed private worker subcollection
      await adminDb.collection('worker_profiles').doc('worker1').collection('private').doc('contact').set({
        phone: '+919876543210',
        email: 'alice@example.com',
        aadhaar: 'XXXX-XXXX-1234',
        emergencyContact: '+919876543211',
      });

      // Seed public contractor profile
      await adminDb.collection('contractor_profiles').doc('contractor1').set({
        name: 'Bob Contractor',
        companyName: 'Bob Builds Ltd',
        isVerified: false,
        rating: 0,
        reviewCount: 0,
        createdAt: new Date(),
      });
      // Seed private contractor subcollection
      await adminDb.collection('contractor_profiles').doc('contractor1').collection('private').doc('contact').set({
        phone: '+919123456780',
        email: 'bob@example.com',
        gstin: '29ABCDE1234F1Z5',
        bankAccount: '1234567890',
      });
    });
  });

  test('H1: owner can read own public worker profile and private subcollection', async () => {
    const dbWorker1 = testEnv.authenticatedContext('worker1').firestore();
    const publicDoc = await assertSucceeds(dbWorker1.collection('worker_profiles').doc('worker1').get());
    assert.equal(publicDoc.data().name, 'Alice Worker');
    const privateDoc = await assertSucceeds(
      dbWorker1.collection('worker_profiles').doc('worker1').collection('private').doc('contact').get()
    );
    assert.equal(privateDoc.data().phone, '+919876543210');
  });

  test('H2: owner can write and update own private worker subcollection', async () => {
    const dbWorker1 = testEnv.authenticatedContext('worker1').firestore();
    await assertSucceeds(
      dbWorker1.collection('worker_profiles').doc('worker1').collection('private').doc('contact').update({
        emergencyContact: '+919999988888',
      })
    );
  });

  test('H3: owner can read own public contractor profile and private subcollection', async () => {
    const dbContractor1 = testEnv.authenticatedContext('contractor1').firestore();
    const publicDoc = await assertSucceeds(dbContractor1.collection('contractor_profiles').doc('contractor1').get());
    assert.equal(publicDoc.data().companyName, 'Bob Builds Ltd');
    const privateDoc = await assertSucceeds(
      dbContractor1.collection('contractor_profiles').doc('contractor1').collection('private').doc('contact').get()
    );
    assert.equal(privateDoc.data().gstin, '29ABCDE1234F1Z5');
  });

  test('H4: owner can write and update own private contractor subcollection', async () => {
    const dbContractor1 = testEnv.authenticatedContext('contractor1').firestore();
    await assertSucceeds(
      dbContractor1.collection('contractor_profiles').doc('contractor1').collection('private').doc('contact').update({
        bankAccount: '9876543210',
      })
    );
  });

  test('H5: worker can read another workers public profile', async () => {
    const dbWorker2 = testEnv.authenticatedContext('worker2').firestore();
    const publicDoc = await assertSucceeds(dbWorker2.collection('worker_profiles').doc('worker1').get());
    assert.equal(publicDoc.data().name, 'Alice Worker');
  });

  test('H6: worker cannot read another workers private subcollection', async () => {
    const dbWorker2 = testEnv.authenticatedContext('worker2').firestore();
    await assertFails(
      dbWorker2.collection('worker_profiles').doc('worker1').collection('private').doc('contact').get()
    );
  });

  test('H7: worker cannot write or tamper with another workers private subcollection', async () => {
    const dbWorker2 = testEnv.authenticatedContext('worker2').firestore();
    await assertFails(
      dbWorker2.collection('worker_profiles').doc('worker1').collection('private').doc('contact').set({
        phone: '+910000000000',
      })
    );
  });

  test('H8: contractor can read another contractors public profile', async () => {
    const dbContractor2 = testEnv.authenticatedContext('contractor2').firestore();
    const publicDoc = await assertSucceeds(dbContractor2.collection('contractor_profiles').doc('contractor1').get());
    assert.equal(publicDoc.data().companyName, 'Bob Builds Ltd');
  });

  test('H9: contractor cannot read another contractors private subcollection', async () => {
    const dbContractor2 = testEnv.authenticatedContext('contractor2').firestore();
    await assertFails(
      dbContractor2.collection('contractor_profiles').doc('contractor1').collection('private').doc('contact').get()
    );
  });

  test('H10: contractor cannot write or tamper with another contractors private subcollection', async () => {
    const dbContractor2 = testEnv.authenticatedContext('contractor2').firestore();
    await assertFails(
      dbContractor2.collection('contractor_profiles').doc('contractor1').collection('private').doc('contact').set({
        gstin: 'FAKEGSTIN',
      })
    );
  });

  test('H11: contractor can read workers public profile (applicant review flow)', async () => {
    const dbContractor1 = testEnv.authenticatedContext('contractor1').firestore();
    const publicDoc = await assertSucceeds(dbContractor1.collection('worker_profiles').doc('worker1').get());
    assert.equal(publicDoc.data().name, 'Alice Worker');
  });

  test('H12: contractor cannot read workers private subcollection', async () => {
    const dbContractor1 = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(
      dbContractor1.collection('worker_profiles').doc('worker1').collection('private').doc('contact').get()
    );
  });

  test('H13: worker can read contractors public profile (job details flow)', async () => {
    const dbWorker1 = testEnv.authenticatedContext('worker1').firestore();
    const publicDoc = await assertSucceeds(dbWorker1.collection('contractor_profiles').doc('contractor1').get());
    assert.equal(publicDoc.data().companyName, 'Bob Builds Ltd');
  });

  test('H14: worker cannot read contractors private subcollection', async () => {
    const dbWorker1 = testEnv.authenticatedContext('worker1').firestore();
    await assertFails(
      dbWorker1.collection('contractor_profiles').doc('contractor1').collection('private').doc('contact').get()
    );
  });

  test('H15: unauthenticated user cannot read worker public profile', async () => {
    const dbUnauth = testEnv.unauthenticatedContext().firestore();
    await assertFails(dbUnauth.collection('worker_profiles').doc('worker1').get());
  });

  test('H16: unauthenticated user cannot read worker private subcollection', async () => {
    const dbUnauth = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      dbUnauth.collection('worker_profiles').doc('worker1').collection('private').doc('contact').get()
    );
  });

  test('H17: unauthenticated user cannot read contractor public profile', async () => {
    const dbUnauth = testEnv.unauthenticatedContext().firestore();
    await assertFails(dbUnauth.collection('contractor_profiles').doc('contractor1').get());
  });

  test('H18: unauthenticated user cannot read contractor private subcollection', async () => {
    const dbUnauth = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      dbUnauth.collection('contractor_profiles').doc('contractor1').collection('private').doc('contact').get()
    );
  });

  test('H19: worker cannot update another workers public profile', async () => {
    const dbWorker2 = testEnv.authenticatedContext('worker2').firestore();
    await assertFails(
      dbWorker2.collection('worker_profiles').doc('worker1').update({
        bio: 'Hacked bio',
      })
    );
  });

  test('H20: contractor cannot update another contractors public profile', async () => {
    const dbContractor2 = testEnv.authenticatedContext('contractor2').firestore();
    await assertFails(
      dbContractor2.collection('contractor_profiles').doc('contractor1').update({
        companyName: 'Hacked Company',
      })
    );
  });

  test('H21: user cannot delete own or another users public worker profile', async () => {
    const dbWorker1 = testEnv.authenticatedContext('worker1').firestore();
    const dbWorker2 = testEnv.authenticatedContext('worker2').firestore();
    await assertFails(dbWorker1.collection('worker_profiles').doc('worker1').delete());
    await assertFails(dbWorker2.collection('worker_profiles').doc('worker1').delete());
  });

  test('H22: user cannot delete own or another users public contractor profile', async () => {
    const dbContractor1 = testEnv.authenticatedContext('contractor1').firestore();
    const dbContractor2 = testEnv.authenticatedContext('contractor2').firestore();
    await assertFails(dbContractor1.collection('contractor_profiles').doc('contractor1').delete());
    await assertFails(dbContractor2.collection('contractor_profiles').doc('contractor1').delete());
  });

  test('H23: authenticated user cannot enumerate or scrape worker_profiles collection (anti-scraping)', async () => {
    const dbWorker2 = testEnv.authenticatedContext('worker2').firestore();
    const dbContractor1 = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(dbWorker2.collection('worker_profiles').get());
    await assertFails(dbContractor1.collection('worker_profiles').get());
  });

  test('H24: authenticated user cannot enumerate or scrape contractor_profiles collection (anti-scraping)', async () => {
    const dbWorker1 = testEnv.authenticatedContext('worker1').firestore();
    const dbContractor2 = testEnv.authenticatedContext('contractor2').firestore();
    await assertFails(dbWorker1.collection('contractor_profiles').get());
    await assertFails(dbContractor2.collection('contractor_profiles').get());
  });

  test('H25: collectionGroup query on private subcollection is denied', async () => {
    const dbWorker1 = testEnv.authenticatedContext('worker1').firestore();
    const dbContractor1 = testEnv.authenticatedContext('contractor1').firestore();
    await assertFails(dbWorker1.collectionGroup('private').get());
    await assertFails(dbContractor1.collectionGroup('private').get());
  });
});
