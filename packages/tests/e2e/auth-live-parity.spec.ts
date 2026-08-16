import { expect, test, type Page } from '@playwright/test';

interface LiveAuthProfile {
  baseUrl: string;
  email: string;
  inboxEndpoint: string;
  inboxToken: string;
}

const profile = readLiveAuthProfile(process.env);

test.describe('live owned-auth parity', () => {
  test.skip(!profile, 'Requires an isolated Neon + Resend auth profile and private test inbox.');
  test.skip(({ browserName }) => browserName !== 'chromium', 'Live auth runs once in Chromium.');
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('covers verification, session restoration, repeated recovery, supersession, and replay', async ({
    page,
  }) => {
    const live = requireLiveAuthProfile();
    const password = `Live-${crypto.randomUUID()}-password`;
    const replacementPassword = `Reset-${crypto.randomUUID()}-password`;
    const startedAt = new Date().toISOString();

    await page.goto(`${live.baseUrl}/sign-up`);
    await page.getByLabel('Your name').fill('Lodariq live auth check');
    await page.getByLabel('Email').fill(live.email);
    await page.getByLabel('Workspace').fill('Live auth verification');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    const verificationUrl = await waitForInboxUrl(live, 'email_verification', startedAt);
    await page.goto(verificationUrl);
    await page.getByLabel('New password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Verify email and continue' }).click();
    await expect(page).toHaveURL(`${live.baseUrl}/`);

    await page.reload();
    await expect(page.getByRole('button', { name: /account and workspace menu/i })).toBeVisible();
    await signOut(page);
    await signIn(page, live, password);
    await page.reload();
    await expect(page).toHaveURL(`${live.baseUrl}/`);

    await signOut(page);
    const recoveryUrls: string[] = [];
    let after = new Date().toISOString();
    for (let request = 0; request < 3; request += 1) {
      await page.goto(`${live.baseUrl}/forgot-password`);
      await page.getByLabel('Email').fill(live.email);
      await page.getByRole('button', { name: 'Email a secure link' }).click();
      await expect(page.getByRole('heading', { name: 'Request accepted' })).toBeVisible();
      const url = await waitForInboxUrl(live, 'set_password', after);
      recoveryUrls.push(url);
      after = new Date().toISOString();
      if (request < 2) await page.waitForTimeout(31_000);
    }

    for (const supersededUrl of recoveryUrls.slice(0, -1)) {
      await page.goto(supersededUrl);
      await page.getByLabel('New password', { exact: true }).fill(replacementPassword);
      await page.getByLabel('Confirm password', { exact: true }).fill(replacementPassword);
      await page.getByRole('button', { name: 'Save password and continue' }).click();
      await expect(
        page.getByRole('heading', { name: 'This password link cannot be used' }),
      ).toBeVisible();
    }

    const latestUrl = recoveryUrls[recoveryUrls.length - 1];
    if (!latestUrl) throw new Error('The live inbox did not return the latest recovery URL.');
    await page.goto(latestUrl);
    await page.getByLabel('New password', { exact: true }).fill(replacementPassword);
    await page.getByLabel('Confirm password', { exact: true }).fill(replacementPassword);
    await page.getByRole('button', { name: 'Save password and continue' }).click();
    await expect(page).toHaveURL(`${live.baseUrl}/`);

    await signOut(page);
    await page.goto(latestUrl);
    await page.getByLabel('New password', { exact: true }).fill(replacementPassword);
    await page.getByLabel('Confirm password', { exact: true }).fill(replacementPassword);
    await page.getByRole('button', { name: 'Save password and continue' }).click();
    await expect(
      page.getByRole('heading', { name: 'This password link cannot be used' }),
    ).toBeVisible();
    await signIn(page, live, replacementPassword);
  });
});

async function signIn(page: Page, live: LiveAuthProfile, password: string): Promise<void> {
  await page.goto(`${live.baseUrl}/sign-in`);
  await page.getByLabel('Email or username').fill(live.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(`${live.baseUrl}/`);
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /account and workspace menu/i }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/u);
}

async function waitForInboxUrl(
  live: LiveAuthProfile,
  purpose: 'email_verification' | 'set_password',
  after: string,
): Promise<string> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const endpoint = new URL(live.inboxEndpoint);
    endpoint.searchParams.set('recipient', live.email);
    endpoint.searchParams.set('purpose', purpose);
    endpoint.searchParams.set('after', after);
    const response = await fetch(endpoint, {
      headers: { authorization: `Bearer ${live.inboxToken}` },
      cache: 'no-store',
    });
    if (response.ok) {
      const payload = (await response.json()) as { url?: unknown };
      if (typeof payload.url === 'string' && isExactProfileUrl(payload.url, live.baseUrl)) {
        return payload.url;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timed out waiting for a ${purpose} message in the isolated test inbox.`);
}

function isExactProfileUrl(value: string, baseUrl: string): boolean {
  try {
    const candidate = new URL(value);
    const expected = new URL(baseUrl);
    return candidate.origin === expected.origin;
  } catch {
    return false;
  }
}

function readLiveAuthProfile(environment: NodeJS.ProcessEnv): LiveAuthProfile | null {
  const baseUrl = environment.LODARIQ_AUTH_LIVE_BASE_URL?.replace(/\/$/u, '');
  const email = environment.LODARIQ_AUTH_LIVE_EMAIL?.trim().toLowerCase();
  const inboxEndpoint = environment.LODARIQ_AUTH_TEST_INBOX_ENDPOINT?.trim();
  const inboxToken = environment.LODARIQ_AUTH_TEST_INBOX_TOKEN?.trim();
  if (!baseUrl || !email || !inboxEndpoint || !inboxToken) return null;
  try {
    if (new URL(baseUrl).protocol !== 'https:') return null;
    if (new URL(inboxEndpoint).protocol !== 'https:') return null;
    return { baseUrl, email, inboxEndpoint, inboxToken };
  } catch {
    return null;
  }
}

function requireLiveAuthProfile(): LiveAuthProfile {
  if (!profile) throw new Error('Live auth profile is not configured.');
  return profile;
}
