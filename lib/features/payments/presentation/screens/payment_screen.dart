import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wrozo/features/authentication/data/auth_repository.dart';
import 'package:wrozo/features/payments/data/payment_repository.dart';
import '../../../../core/theme/app_colors.dart';

class PaymentScreen extends ConsumerWidget {
  const PaymentScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider).value;
    if (user == null) return const Scaffold(body: Center(child: Text('Not logged in')));

    final appUser = ref.watch(appUserProvider).value;
    final isContractor = appUser?.role == 'CONTRACTOR';

    final paymentsAsync = isContractor
        ? ref.watch(contractorPaymentsProvider(user.uid))
        : ref.watch(workerPaymentsProvider(user.uid));

    return Scaffold(
      appBar: AppBar(title: const Text('Payments & Earnings')),
      body: paymentsAsync.when(
        data: (payments) {
          if (payments.isEmpty) {
            return const Center(child: Text('No transaction history yet.'));
          }

          num total = 0;
          for (var p in payments) {
            if (p.status.name == 'completed') total += p.amount;
          }

          return Column(
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                color: AppColors.primary,
                child: Column(
                  children: [
                    Text(
                      isContractor ? 'Total Paid' : 'Total Earnings',
                      style: const TextStyle(color: Colors.white70, fontSize: 16),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '₹${total.toInt()}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 36,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: payments.length,
                  itemBuilder: (context, index) {
                    final p = payments[index];
                    return Card(
                      color: AppColors.surface,
                      elevation: 1,
                      margin: const EdgeInsets.only(bottom: 12),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: p.status.name == 'completed' ? AppColors.success : AppColors.accent,
                          child: Icon(
                            isContractor ? Icons.arrow_outward : Icons.arrow_downward,
                            color: Colors.white,
                            size: 20,
                          ),
                        ),
                        title: Text(
                          isContractor ? 'Paid to Worker: ${p.workerId.substring(0,5)}' : 'Received from: ${p.contractorId.substring(0,5)}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: Text('Job: ${p.jobId.substring(0,8)}... \nStatus: ${p.status.name.toUpperCase()}'),
                        trailing: Text(
                          '₹${p.amount}',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: p.status.name == 'completed' ? AppColors.success : AppColors.textPrimary,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, st) => Center(child: Text('Error: $e')),
      ),
    );
  }
}
