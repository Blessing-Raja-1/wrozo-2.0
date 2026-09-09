import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wrozo/core/widgets/primary_button.dart';
import 'package:wrozo/core/widgets/custom_text_field.dart';
import 'package:wrozo/features/authentication/data/auth_repository.dart';
import 'package:wrozo/features/profile/presentation/profile_controller.dart';
import 'package:wrozo/features/profile/domain/worker_profile.dart';
import 'package:wrozo/features/profile/domain/contractor_profile.dart';

class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _companyController = TextEditingController();
  final _wageController = TextEditingController();
  final _skillsController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _companyController.dispose();
    _wageController.dispose();
    _skillsController.dispose();
    super.dispose();
  }

  void _submitWorker() {
    if (_formKey.currentState!.validate()) {
      final user = ref.read(authStateProvider).value;
      if (user == null) return;

      final skills = _skillsController.text
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();

      final profile = WorkerProfile(
        uid: user.uid,
        name: _nameController.text.trim(),
        skills: skills,
        expectedWage: int.tryParse(_wageController.text.trim()) ?? 0,
        isAvailable: true,
      );

      ref.read(profileControllerProvider.notifier).saveWorkerProfile(profile);
    }
  }

  void _submitContractor() {
    if (_formKey.currentState!.validate()) {
      final user = ref.read(authStateProvider).value;
      if (user == null) return;

      final profile = ContractorProfile(
        uid: user.uid,
        name: _nameController.text.trim(),
        companyName: _companyController.text.trim(),
      );

      ref.read(profileControllerProvider.notifier).saveContractorProfile(profile);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appUser = ref.watch(appUserProvider).value;
    final isWorker = (appUser?.currentActiveMode ?? 'WORKER') == 'WORKER';
    
    final profileState = ref.watch(profileControllerProvider);
    final isLoading = profileState is AsyncLoading;

    ref.listen<AsyncValue>(profileControllerProvider, (_, state) {
      if (!state.isLoading && state.hasError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(state.error.toString())),
        );
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Complete Your Profile'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CustomTextField(
                  label: 'Full Name',
                  controller: _nameController,
                  validator: (val) => (val == null || val.isEmpty) ? 'Required' : null,
                ),
                if (isWorker) ...[
                  CustomTextField(
                    label: 'Expected Daily Wage (₹)',
                    controller: _wageController,
                    keyboardType: TextInputType.number,
                    validator: (val) => (val == null || val.isEmpty) ? 'Required' : null,
                  ),
                  CustomTextField(
                    label: 'Skills (comma separated)',
                    hint: 'e.g., Plumber, Carpenter, Helper',
                    controller: _skillsController,
                    validator: (val) => (val == null || val.isEmpty) ? 'Required' : null,
                  ),
                ] else ...[
                  CustomTextField(
                    label: 'Company / Firm Name (Optional)',
                    controller: _companyController,
                  ),
                ],
                const SizedBox(height: 32),
                PrimaryButton(
                  text: 'Save Profile',
                  isLoading: isLoading,
                  onPressed: isWorker ? _submitWorker : _submitContractor,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
