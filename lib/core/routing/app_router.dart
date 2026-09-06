import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/authentication/data/auth_repository.dart';
import '../../features/authentication/presentation/screens/login_screen.dart';
import '../../features/authentication/presentation/screens/otp_screen.dart';
import '../../features/authentication/presentation/screens/role_selection_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';

import '../../features/chat/presentation/screens/chat_inbox_screen.dart';
import '../../features/chat/presentation/screens/conversation_screen.dart';
import '../../features/payments/presentation/screens/payment_screen.dart';
import '../../features/reviews/presentation/screens/review_screen.dart';

final goRouterProvider = Provider<GoRouter>((ref) {
  final appUserAsync = ref.watch(appUserProvider);

  return GoRouter(
    initialLocation: '/login',
    redirect: (context, state) {
      final isLoading = appUserAsync.isLoading;
      final appUser = appUserAsync.value;
      
      final isLoggingIn = state.matchedLocation == '/login' || state.matchedLocation == '/otp';
      
      if (isLoading) return null; // Wait for initialization
      
      // Not logged in -> Redirect to login
      if (appUser == null) {
        return isLoggingIn ? null : '/login';
      }
      
      // Logged in, but role not selected -> Redirect to role selection
      if (appUser.role == null) {
        if (state.matchedLocation == '/role_selection') return null;
        return '/role_selection';
      }
      
      // Logged in, role selected, but trying to access auth screens -> Redirect to home
      if (isLoggingIn || state.matchedLocation == '/role_selection') {
        return '/home';
      }
      
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/otp',
        builder: (context, state) => const OtpScreen(),
      ),
      GoRoute(
        path: '/role_selection',
        builder: (context, state) => const RoleSelectionScreen(),
      ),
      GoRoute(
        path: '/home',
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: '/chat',
        builder: (context, state) => const ChatInboxScreen(),
      ),
      GoRoute(
        path: '/chat/:peerId',
        builder: (context, state) => ConversationScreen(
          peerId: state.pathParameters['peerId']!,
        ),
      ),
      GoRoute(
        path: '/payments',
        builder: (context, state) => const PaymentScreen(),
      ),
      GoRoute(
        path: '/review/:jobId/:revieweeId',
        builder: (context, state) => ReviewScreen(
          jobId: state.pathParameters['jobId']!,
          revieweeId: state.pathParameters['revieweeId']!,
        ),
      ),
    ],
  );
});
