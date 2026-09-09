import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:wrozo/core/theme/app_colors.dart';
import 'package:wrozo/features/authentication/data/auth_repository.dart';
import 'package:wrozo/features/authentication/presentation/auth_controller.dart';
import 'package:wrozo/features/applications/data/application_repository.dart';
import 'package:wrozo/features/applications/domain/application.dart';
import 'package:wrozo/features/jobs/data/job_repository.dart';
import 'package:wrozo/features/jobs/domain/job.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appUser = ref.watch(appUserProvider).value;
    final isWorker = (appUser?.currentActiveMode ?? 'WORKER') == 'WORKER';
    final isDualRole = appUser?.isDualRole ?? false;

    return Scaffold(
      appBar: AppBar(
        title: Text(isWorker ? 'Worker Dashboard' : 'Contractor Dashboard'),
        actions: [
          if (isDualRole)
            IconButton(
              icon: Icon(isWorker ? Icons.business : Icons.handyman),
              tooltip: isWorker ? 'Switch to Contractor Mode' : 'Switch to Worker Mode',
              onPressed: () {
                final targetMode = isWorker ? 'CONTRACTOR' : 'WORKER';
                ref.read(authControllerProvider.notifier).switchActiveMode(targetMode);
              },
            ),
          IconButton(
            icon: const Icon(Icons.chat_bubble_outline),
            tooltip: 'Messages',
            onPressed: () => context.push('/chat'),
          ),
          IconButton(
            icon: const Icon(Icons.person_outline),
            tooltip: 'Profile',
            onPressed: () => context.push('/profile'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: () {
              ref.read(authControllerProvider.notifier).signOut();
            },
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Welcome Banner
              Card(
                color: AppColors.surface,
                elevation: 1,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: const BorderSide(color: AppColors.border),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 28,
                            backgroundColor: AppColors.primaryLight,
                            child: Icon(
                              isWorker ? Icons.handyman : Icons.business,
                              color: Colors.white,
                              size: 28,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  isWorker ? 'Welcome, Worker!' : 'Welcome, Contractor!',
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  appUser?.phone ?? 'Authenticated User',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      if (isDualRole) ...[
                        const SizedBox(height: 16),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: AppColors.background,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                isWorker ? Icons.handyman : Icons.business,
                                size: 18,
                                color: AppColors.primary,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                isWorker ? 'Active: Worker' : 'Active: Contractor',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                              const Spacer(),
                              InkWell(
                                onTap: () {
                                  final target = isWorker ? 'CONTRACTOR' : 'WORKER';
                                  ref
                                      .read(authControllerProvider.notifier)
                                      .switchActiveMode(target);
                                },
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.swap_horiz,
                                        size: 16, color: AppColors.primary),
                                    const SizedBox(width: 4),
                                    Text(
                                      isWorker ? 'Switch to Contractor' : 'Switch to Worker',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                        color: AppColors.primary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Quick Actions
              const Text(
                'Quick Actions',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 12),

              if (isWorker) ...[
                _buildActionCard(
                  context: context,
                  title: 'Find Nearby Jobs',
                  subtitle: 'Discover open jobs in your area and apply',
                  icon: Icons.search,
                  color: AppColors.primary,
                  onTap: () => context.push('/jobs/discover'),
                ),
                const SizedBox(height: 12),
                _buildActionCard(
                  context: context,
                  title: 'Complete / Edit Profile',
                  subtitle: 'Update your trade skills and expected wage',
                  icon: Icons.badge_outlined,
                  color: AppColors.accent,
                  onTap: () => context.push('/profile'),
                ),
                const SizedBox(height: 12),
                _buildActionCard(
                  context: context,
                  title: 'Messages & Chat',
                  subtitle: 'Communicate with contractors regarding jobs',
                  icon: Icons.chat,
                  color: AppColors.primaryLight,
                  onTap: () => context.push('/chat'),
                ),
              ] else ...[
                _buildActionCard(
                  context: context,
                  title: 'Post a New Job',
                  subtitle: 'Create a job opening for local workers',
                  icon: Icons.add_circle_outline,
                  color: AppColors.primary,
                  onTap: () => context.push('/jobs/post'),
                ),
                const SizedBox(height: 12),
                _buildActionCard(
                  context: context,
                  title: 'Company Profile',
                  subtitle: 'Update company details and verification status',
                  icon: Icons.business_outlined,
                  color: AppColors.accent,
                  onTap: () => context.push('/profile'),
                ),
                const SizedBox(height: 12),
                _buildActionCard(
                  context: context,
                  title: 'Messages & Chat',
                  subtitle: 'Communicate with workers you accepted',
                  icon: Icons.chat,
                  color: AppColors.primaryLight,
                  onTap: () => context.push('/chat'),
                ),
              ],

              const SizedBox(height: 24),

              // Role Specific Data Section
              if (isWorker)
                _WorkerApplicationsSection(workerId: appUser?.uid ?? '')
              else
                _ContractorJobsSection(contractorId: appUser?.uid ?? ''),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActionCard({
    required BuildContext context,
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Card(
      elevation: 1,
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 24),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

class _WorkerApplicationsSection extends ConsumerWidget {
  final String workerId;

  const _WorkerApplicationsSection({required this.workerId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (workerId.isEmpty) return const SizedBox.shrink();

    final appsAsync = ref.watch(workerApplicationsProvider(workerId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'My Applications',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 12),
        appsAsync.when(
          data: (applications) {
            if (applications.isEmpty) {
              return Card(
                color: AppColors.surface,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: const BorderSide(color: AppColors.border),
                ),
                child: const Padding(
                  padding: EdgeInsets.all(20.0),
                  child: Center(
                    child: Text(
                      'No job applications yet.\nTap "Find Nearby Jobs" to explore openings!',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
                    ),
                  ),
                ),
              );
            }

            return ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: applications.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final app = applications[index];
                return _buildApplicationTile(app);
              },
            );
          },
          loading: () => const Center(
            child: Padding(
              padding: EdgeInsets.all(16.0),
              child: CircularProgressIndicator(),
            ),
          ),
          error: (e, _) => Center(
            child: Text(
              'Error loading applications: $e',
              style: const TextStyle(color: AppColors.error),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildApplicationTile(Application app) {
    Color badgeColor;
    switch (app.status) {
      case ApplicationStatus.accepted:
        badgeColor = AppColors.success;
        break;
      case ApplicationStatus.rejected:
        badgeColor = AppColors.error;
        break;
      case ApplicationStatus.withdrawn:
        badgeColor = AppColors.textSecondary;
        break;
      case ApplicationStatus.pending:
      default:
        badgeColor = AppColors.accent;
    }

    return Card(
      color: AppColors.surface,
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Job ID: ${app.jobId.length > 12 ? '${app.jobId.substring(0, 12)}...' : app.jobId}',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                ),
                const SizedBox(height: 2),
                Text(
                  'Contractor: ${app.contractorId.length > 8 ? '${app.contractorId.substring(0, 8)}...' : app.contractorId}',
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: badgeColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: badgeColor.withOpacity(0.4)),
              ),
              child: Text(
                app.status.name.toUpperCase(),
                style: TextStyle(color: badgeColor, fontSize: 11, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ContractorJobsSection extends ConsumerWidget {
  final String contractorId;

  const _ContractorJobsSection({required this.contractorId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (contractorId.isEmpty) return const SizedBox.shrink();

    final jobsAsync = ref.watch(contractorJobsProvider(contractorId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'My Posted Jobs',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 12),
        jobsAsync.when(
          data: (jobs) {
            if (jobs.isEmpty) {
              return Card(
                color: AppColors.surface,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: const BorderSide(color: AppColors.border),
                ),
                child: const Padding(
                  padding: EdgeInsets.all(20.0),
                  child: Center(
                    child: Text(
                      'No jobs posted yet.\nTap "Post a New Job" to recruit workers!',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
                    ),
                  ),
                ),
              );
            }

            return ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: jobs.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final job = jobs[index];
                return _buildJobCard(context, job);
              },
            );
          },
          loading: () => const Center(
            child: Padding(
              padding: EdgeInsets.all(16.0),
              child: CircularProgressIndicator(),
            ),
          ),
          error: (e, _) => Center(
            child: Text(
              'Error loading jobs: $e',
              style: const TextStyle(color: AppColors.error),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildJobCard(BuildContext context, Job job) {
    return Card(
      color: AppColors.surface,
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    job.title,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                ),
                Text(
                  '₹${job.wage}/day',
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Workers Needed: ${job.workerCountNeeded}',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.people_outline, size: 16),
                label: const Text('Review Applicants'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryLight,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                ),
                onPressed: () {
                  context.push('/applicant_review/${job.id}');
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
