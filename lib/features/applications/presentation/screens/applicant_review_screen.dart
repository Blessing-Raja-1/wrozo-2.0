import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/application_repository.dart';
import '../presentation/application_controller.dart';
import '../../../../core/theme/app_colors.dart';

class ApplicantReviewScreen extends ConsumerWidget {
  final String jobId;

  const ApplicantReviewScreen({super.key, required this.jobId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appsAsync = ref.watch(jobApplicationsProvider(jobId));
    final appState = ref.watch(applicationControllerProvider);
    final isProcessing = appState is AsyncLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Review Applicants')),
      body: appsAsync.when(
        data: (applications) {
          if (applications.isEmpty) {
            return const Center(child: Text('No pending applications yet.'));
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: applications.length,
            itemBuilder: (context, index) {
              final app = applications[index];
              return Card(
                color: AppColors.surface,
                elevation: 1,
                margin: const EdgeInsets.only(bottom: 16),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Worker ID: ${app.workerId}', style: const TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      Text('Status: ${app.status.name.toUpperCase()}', style: const TextStyle(color: AppColors.primary)),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: isProcessing ? null : () {
                              ref.read(applicationControllerProvider.notifier).rejectApplication(app);
                            },
                            style: TextButton.styleFrom(foregroundColor: AppColors.error),
                            child: const Text('Reject'),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            onPressed: isProcessing ? null : () {
                              ref.read(applicationControllerProvider.notifier).acceptApplication(app);
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.success,
                              foregroundColor: Colors.white,
                            ),
                            child: const Text('Accept'),
                          ),
                        ],
                      )
                    ],
                  ),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('Error: $e')),
      ),
    );
  }
}
