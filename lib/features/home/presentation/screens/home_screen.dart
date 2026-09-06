import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wrozo/features/authentication/presentation/auth_controller.dart';
import 'package:wrozo/features/authentication/data/auth_repository.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appUser = ref.watch(appUserProvider).value;
    
    return Scaffold(
      appBar: AppBar(
        title: Text('Wrozo ${appUser?.role == 'WORKER' ? 'Worker' : 'Contractor'} Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () {
              ref.read(authControllerProvider.notifier).signOut();
            },
          ),
        ],
      ),
      body: Center(
        child: Text('Welcome, ${appUser?.phone}!\nYou are a ${appUser?.role}'),
      ),
    );
  }
}
