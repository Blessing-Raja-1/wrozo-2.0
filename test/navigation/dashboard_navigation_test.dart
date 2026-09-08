import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:wrozo/features/authentication/data/auth_repository.dart';
import 'package:wrozo/features/authentication/domain/app_user.dart';
import 'package:wrozo/features/applications/data/application_repository.dart';
import 'package:wrozo/features/applications/domain/application.dart';
import 'package:wrozo/features/jobs/data/job_repository.dart';
import 'package:wrozo/features/jobs/domain/job.dart';
import 'package:wrozo/features/home/presentation/screens/home_screen.dart';

void main() {
  group('HomeScreen Role-Based Dashboard Navigation', () {
    testWidgets('Worker dashboard displays worker-specific actions and no contractor actions', (tester) async {
      final workerUser = AppUser(
        uid: 'worker_001',
        phone: '+919876543210',
        role: 'WORKER',
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appUserProvider.overrideWith((ref) => Stream.value(workerUser)),
            workerApplicationsProvider.overrideWith((ref, workerId) => Stream.value(<Application>[])),
          ],
          child: const MaterialApp(
            home: HomeScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify Worker headers and actions are present
      expect(find.text('Worker Dashboard'), findsOneWidget);
      expect(find.text('Welcome, Worker!'), findsOneWidget);
      expect(find.text('Find Nearby Jobs'), findsOneWidget);
      expect(find.text('Complete / Edit Profile'), findsOneWidget);
      expect(find.text('Messages & Chat'), findsOneWidget);
      expect(find.text('My Applications'), findsOneWidget);

      // Verify Contractor-only actions are NOT present
      expect(find.text('Contractor Dashboard'), findsNothing);
      expect(find.text('Welcome, Contractor!'), findsNothing);
      expect(find.text('Post a New Job'), findsNothing);
      expect(find.text('My Posted Jobs'), findsNothing);
    });

    testWidgets('Contractor dashboard displays contractor-specific actions and no worker actions', (tester) async {
      final contractorUser = AppUser(
        uid: 'contractor_001',
        phone: '+919876543211',
        role: 'CONTRACTOR',
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appUserProvider.overrideWith((ref) => Stream.value(contractorUser)),
            contractorJobsProvider.overrideWith((ref, contractorId) => Stream.value(<Job>[])),
          ],
          child: const MaterialApp(
            home: HomeScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify Contractor headers and actions are present
      expect(find.text('Contractor Dashboard'), findsOneWidget);
      expect(find.text('Welcome, Contractor!'), findsOneWidget);
      expect(find.text('Post a New Job'), findsOneWidget);
      expect(find.text('Company Profile'), findsOneWidget);
      expect(find.text('Messages & Chat'), findsOneWidget);
      expect(find.text('My Posted Jobs'), findsOneWidget);

      // Verify Worker-only actions are NOT present
      expect(find.text('Worker Dashboard'), findsNothing);
      expect(find.text('Welcome, Worker!'), findsNothing);
      expect(find.text('Find Nearby Jobs'), findsNothing);
      expect(find.text('My Applications'), findsNothing);
    });

    testWidgets('Contractor dashboard displays posted jobs and Review Applicants action', (tester) async {
      final contractorUser = AppUser(
        uid: 'contractor_001',
        phone: '+919876543211',
        role: 'CONTRACTOR',
      );

      final sampleJob = Job(
        id: 'job_sample_123',
        contractorId: 'contractor_001',
        title: 'Carpentry Repair',
        description: 'Fix wooden door frame',
        skillsRequired: ['Carpentry'],
        wage: 800,
        workerCountNeeded: 2,
        status: JobStatus.open,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appUserProvider.overrideWith((ref) => Stream.value(contractorUser)),
            contractorJobsProvider.overrideWith((ref, contractorId) => Stream.value([sampleJob])),
          ],
          child: const MaterialApp(
            home: HomeScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify posted job title, wage, and Review Applicants button render
      expect(find.text('Carpentry Repair'), findsOneWidget);
      expect(find.text('₹800/day'), findsOneWidget);
      expect(find.text('Workers Needed: 2'), findsOneWidget);
      expect(find.text('Review Applicants'), findsOneWidget);
    });
  });
}
