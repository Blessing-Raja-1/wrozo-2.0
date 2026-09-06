import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../../core/widgets/custom_text_field.dart';
import '../job_controller.dart';
import 'package:go_router/go_router.dart';

class JobPostingScreen extends ConsumerStatefulWidget {
  const JobPostingScreen({super.key});

  @override
  ConsumerState<JobPostingScreen> createState() => _JobPostingScreenState();
}

class _JobPostingScreenState extends ConsumerState<JobPostingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  final _skillsController = TextEditingController();
  final _wageController = TextEditingController();
  final _workersController = TextEditingController(text: '1');

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    _skillsController.dispose();
    _wageController.dispose();
    _workersController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState!.validate()) {
      final skills = _skillsController.text
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();

      ref.read(jobControllerProvider.notifier).postJob(
        title: _titleController.text.trim(),
        description: _descController.text.trim(),
        skills: skills,
        wage: int.tryParse(_wageController.text.trim()) ?? 0,
        workersNeeded: int.tryParse(_workersController.text.trim()) ?? 1,
      ).then((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Job Posted Successfully')));
        context.pop();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(jobControllerProvider) is AsyncLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Post a Job')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CustomTextField(
                  label: 'Job Title',
                  controller: _titleController,
                  validator: (val) => (val == null || val.isEmpty) ? 'Required' : null,
                ),
                CustomTextField(
                  label: 'Description',
                  controller: _descController,
                  maxLines: 4,
                  validator: (val) => (val == null || val.isEmpty) ? 'Required' : null,
                ),
                CustomTextField(
                  label: 'Skills Required (comma separated)',
                  controller: _skillsController,
                  validator: (val) => (val == null || val.isEmpty) ? 'Required' : null,
                ),
                CustomTextField(
                  label: 'Daily Wage (₹)',
                  controller: _wageController,
                  keyboardType: TextInputType.number,
                  validator: (val) => (val == null || val.isEmpty) ? 'Required' : null,
                ),
                CustomTextField(
                  label: 'Number of Workers Needed',
                  controller: _workersController,
                  keyboardType: TextInputType.number,
                  validator: (val) => (val == null || val.isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 24),
                PrimaryButton(
                  text: 'Post Job',
                  isLoading: isLoading,
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
