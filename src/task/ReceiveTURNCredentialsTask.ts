// Copyright 2019-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import AudioVideoControllerState from '../audiovideocontroller/AudioVideoControllerState';
import ContentShareConstants from '../contentsharecontroller/ContentShareConstants';
import MeetingSessionStatusCode from '../meetingsession/MeetingSessionStatusCode';
import MeetingSessionTURNCredentials from '../meetingsession/MeetingSessionTURNCredentials';
import Versioning from '../versioning/Versioning';
import BaseTask from './BaseTask';

/*
 * [[ReceiveTURNCredentialsTask]] asynchronously retrieves TURN credentials.
 */
export default class ReceiveTURNCredentialsTask extends BaseTask {
  protected taskName = 'ReceiveTURNCredentialsTask';

  private url: string;
  private meetingId: string;
  private joinToken: string;
  private cancelPromise: (error: Error) => void;

  constructor(private context: AudioVideoControllerState) {
    super(context.logger);
    this.url = context.meetingSessionConfiguration.urls.turnControlURL;
    this.meetingId = context.meetingSessionConfiguration.meetingId;
    this.joinToken = context.meetingSessionConfiguration.credentials.joinToken;
  }

  cancel(): void {
    const error = new Error(`canceling ${this.name()}`);
    this.cancelPromise && this.cancelPromise(error);
  }

  async run(): Promise<void> {
    if (!this.url) {
      this.context.logger.info('skipping TURN credentials');
      return;
    }

    const options: RequestInit = {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache',
      credentials: 'omit',
      redirect: 'follow',
      referrer: 'no-referrer',
    };

    const url: string = this.url + `?m=${this.meetingId}&t=${this.joinToken.replace(ContentShareConstants.Modality, '')}`;
    this.context.logger.info(`requesting TURN credentials from ${url}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseBodyJson = await new Promise<any>(async (resolve, reject) => {
      this.cancelPromise = (error: Error) => {
        reject(error);
      };

      try {
        const responseBody = await fetch(Versioning.urlWithVersion(url), options);
        this.context.logger.info(`received TURN credentials`);
        if (responseBody.status && responseBody.status === 403) {
          reject(
            new Error(
              `canceling ${this.name()} due to the meeting status code: ${
                MeetingSessionStatusCode.TURNCredentialsForbidden
              }`
            )
          );
        }
        if (responseBody.status && responseBody.status === 404) {
          reject(
            new Error(
              `canceling ${this.name()} due to the meeting status code: ${
                MeetingSessionStatusCode.TURNMeetingEnded
              }`
            )
          );
        }
        resolve(await responseBody.json());
      } catch (error) {
        reject(error);
      }
    });

    this.context.turnCredentials = new MeetingSessionTURNCredentials();
    this.context.turnCredentials.password = responseBodyJson.password;
    this.context.turnCredentials.ttl = responseBodyJson.ttl;
    this.context.turnCredentials.uris = responseBodyJson.uris.map((uri: string): string => {
      return this.context.meetingSessionConfiguration.urls.urlRewriter(uri);
    });
    this.context.turnCredentials.username = responseBodyJson.username;
  }
}
