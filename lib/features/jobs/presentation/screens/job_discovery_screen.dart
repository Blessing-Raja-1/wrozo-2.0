import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/job_repository.dart';
import '../../../../core/theme/app_colors.dart';
import '../../applications/presentation/application_controller.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../../core/services/location_service.dart';

class JobDiscoveryScreen extends ConsumerWidget {
  const JobDiscoveryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locationAsync = ref.watch(userLocationProvider);
    final applicationState = ref.watch(applicationControllerProvider);
    final isApplying = applicationState is AsyncLoading;

    ref.listen<AsyncValue>(applicationControllerProvider, (_, state) {
      if (!state.isLoading) {
        if (state.hasError) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.error.toString())));
        } else {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Application submitted successfully!')));
        }
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Nearby Jobs'),
      ),
      body: locationAsync.when(
        data: (geoPoint) {
          if (geoPoint == null) {
            return const Center(child: Text('Location permission is required to find jobs near you.'));
          }

          final jobsAsync = ref.watch(nearbyJobsProvider(geoPoint));

          return jobsAsync.when(
            data: (jobs) {
              if (jobs.isEmpty) {
                return const Center(child: Text('No open jobs available near you.'));
              }
              return ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: jobs.length,
                itemBuilder: (context, index) {
                  final job = jobs[index];
                  // Rest of the list item code
                  return Card(
                    margin: const EdgeInsets.only(bottom: 16),
                    color: AppColors.surface,
                    elevation: 1,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: const BorderSide(color: AppColors.border),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  job.title,
                                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                                ),
                              ),
                              Text(
                                '₹${job.wage}/day',
                                style: const TextStyle(fontSize: 16, color: AppColors.primary, fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(job.description, maxLines: 2, overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            children: job.skillsRequired.map((s) => Chip(
                              label: Text(s, style: const TextStyle(fontSize: 12)),
                              padding: EdgeInsets.zero,
                              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            )).toList(),
                          ),
                          const SizedBox(height: 16),
                          PrimaryButton(
                            text: 'Apply Now',
                            isLoading: isApplying,
                            onPressed: () {
                              ref.read(applicationControllerProvider.notifier).applyForJob(job);
                            },
                          ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (err, st) => Center(child: Text('Error loading jobs: $err')),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, st) => Center(child: Text('Error getting location: $err')),
      ),
    );
  }
}

