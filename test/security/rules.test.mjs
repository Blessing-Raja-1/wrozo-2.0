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
