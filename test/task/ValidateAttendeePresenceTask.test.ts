// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as chai from 'chai';

import AudioVideoControllerState from '../../src/audiovideocontroller/AudioVideoControllerState';
import NoOpDebugLogger from '../../src/logger/NoOpDebugLogger';
import MeetingSessionConfiguration from '../../src/meetingsession/MeetingSessionConfiguration';
import MeetingSessionCredentials from '../../src/meetingsession/MeetingSessionCredentials';
import MeetingSessionStatusCode from '../../src/meetingsession/MeetingSessionStatusCode';
import DefaultRealtimeController from '../../src/realtimecontroller/DefaultRealtimeController';
import TimeoutScheduler from '../../src/scheduler/TimeoutScheduler';
import ValidateAttendeePresenceTask from '../../src/task/ValidateAttendeePresenceTask';
import DOMMockBehavior from '../dommock/DOMMockBehavior';
import DOMMockBuilder from '../dommock/DOMMockBuilder';

describe('ValidateAttendeePresenceTask', () => {
  const expect: Chai.ExpectStatic = chai.expect;
  const attendeeId = 'attendee-id';

  let domMockBehavior: DOMMockBehavior;
  let domMockBuilder: DOMMockBuilder;
  let context: AudioVideoControllerState;
  let task: ValidateAttendeePresenceTask;

  beforeEach(() => {
    domMockBehavior = new DOMMockBehavior();
    domMockBuilder = new DOMMockBuilder(domMockBehavior);
    context = new AudioVideoControllerState();
    context.logger = new NoOpDebugLogger();
    context.realtimeController = new DefaultRealtimeController();
    context.meetingSessionConfiguration = new MeetingSessionConfiguration();
    context.meetingSessionConfiguration.credentials = new MeetingSessionCredentials();
    context.meetingSessionConfiguration.credentials.attendeeId = 'attendee-id';
    context.meetingSessionConfiguration.attendeePresenceTimeoutMs = 5000;
    task = new ValidateAttendeePresenceTask(context);
  });

  afterEach(() => {
    domMockBuilder.cleanup();
  });

  describe('run', async () => {
    it('does nothing if the attendee presence timeout is set to zero', async () => {
      context.meetingSessionConfiguration.attendeePresenceTimeoutMs = 0;
      try {
        await task.run();
      } catch (error) {
        throw new Error('This line should not be reached.');
      }
    });

    it('succeeds if the attendee ID for the attendee already exists', async () => {
      context.presentAttendeeIds.add(attendeeId);
      await new Promise(resolve => new TimeoutScheduler(100).start(resolve));
      try {
        await task.run();
      } catch (error) {
        throw new Error('This line should not be reached.');
      }
    });

    it('succeeds if the attendee becomes present', async () => {
      try {
        new TimeoutScheduler(100).start(async () => {
          context.realtimeController.realtimeSetAttendeeIdPresence(
            'attendee-id-1',
            true,
            'attendee-id-1',
            false
          );
          context.realtimeController.realtimeSetAttendeeIdPresence(
            'attendee-id-2',
            true,
            'attendee-id-2',
            false
          );
          context.realtimeController.realtimeSetAttendeeIdPresence(
            attendeeId,
            true,
            attendeeId,
            false
          );
        });
        await task.run();
      } catch (error) {
        throw new Error('This line should not be reached.');
      }
    });

    it('throws the NoAttendeePresent error when timed out', async () => {
      context.meetingSessionConfiguration.attendeePresenceTimeoutMs = 100;
      try {
        await task.run();
        throw new Error('This line should not be reached.');
      } catch (error) {
        expect(error.message).includes(
          `the meeting status code: ${MeetingSessionStatusCode.NoAttendeePresent}`
        );
      }
    });
  });

  describe('cancel', () => {
    it('cancels a task while waiting for the attendee presence event', async () => {
      try {
        new TimeoutScheduler(100).start(async () => {
          task.cancel();
          context.realtimeController.realtimeSetAttendeeIdPresence(
            attendeeId,
            true,
            attendeeId,
            false
          );
        });
        await task.run();
        throw new Error('This line should not be reached.');
      } catch (error) {
        expect(error.message).not.includes(
          `the meeting status code: ${MeetingSessionStatusCode.NoAttendeePresent}`
        );
        expect(error.message).includes('canceling');
      }
    });
  });
});
