import { useEffect } from 'react'
import LegalPage from '../components/LegalPage'

const sections = [
  {
    heading: '1. Overview',
    body: [
      'This policy explains what information RoWild.lol collects, why we collect it, how it is stored, and the choices you have. It applies to the website, the games, the cashier, and the chat.',
      'We keep the data we hold to what is needed to run your account, process payments, operate the games fairly, and keep the platform safe.',
    ],
  },
  {
    heading: '2. Information You Give Us',
    bullets: [
      'Roblox account details you authorise us to read during sign-in: your numeric user ID, username, and avatar headshot.',
      'Email address and password if you register with email instead of Roblox. Passwords are handled and hashed by our authentication provider, never stored by us in readable form.',
      'Crypto wallet addresses, transaction hashes, amounts, and the deposit or withdrawal history needed to credit and pay out your balance.',
      'Support messages, reports, and any other information you choose to send us.',
      'Affiliate or referral codes you enter or share.',
    ],
  },
  {
    heading: '3. Information Collected Automatically',
    bullets: [
      'Technical data such as IP address, browser type, device type, operating system, referring page, and pages you visit.',
      'Session data stored in cookies and browser storage so you stay signed in and your balance and settings follow you between pages.',
      'Game activity: wagers, results, seed and nonce data used by the provably fair system, and rewards claimed.',
      'Chat messages you post, which are visible to other users in the channel and may be reviewed for moderation.',
    ],
  },
  {
    heading: '4. How We Use Information',
    bullets: [
      'To create and secure your account, sign you in, and keep your session active.',
      'To process deposits and withdrawals, match on-chain transfers to the right account, and keep financial records.',
      'To run games, calculate results, distribute rewards and race prizes, and maintain provably fair verification data.',
      'To detect fraud, multi-accounting, bonus abuse, and cheating, and to enforce our Terms of Service.',
      'To moderate chat, respond to support requests, and investigate reports.',
      'To understand how the site is used so we can fix problems and improve features.',
      'To meet legal, tax, and regulatory obligations, and to respond to lawful requests.',
    ],
  },
  {
    heading: '5. Cookies and Local Storage',
    body: [
      'We use a small number of cookies and browser storage entries that are necessary for the site to work: a signed session cookie that keeps you logged in, and local storage entries that remember your referral code and cached profile between visits.',
      'We do not use advertising cookies. Clearing your browser storage will sign you out and reset those preferences.',
    ],
  },
  {
    heading: '6. When We Share Information',
    bullets: [
      'Service providers who host the site and database, process crypto payments, provide blockchain RPC access, deliver bot protection on sign-in and verification forms, and send transactional email.',
      'Other players, for information that is public by design, such as your username, avatar, level, chat messages, and bets shown in the live feed.',
      'Authorities or other parties where we are legally required to disclose, or where disclosure is necessary to investigate fraud, protect users, or defend our rights.',
      'A successor entity if the platform is merged, acquired, or reorganised, under the same privacy commitments.',
    ],
    body: [
      'We do not sell your personal information, and we do not share it with advertisers.',
    ],
  },
  {
    heading: '7. Data Retention',
    body: [
      'Account and transaction records are kept while your account is open and afterwards for as long as we need them for accounting, fraud prevention, dispute resolution, and legal compliance.',
      'Support conversations and moderation records are kept for a limited period. Data that is no longer needed is deleted or anonymised.',
    ],
  },
  {
    heading: '8. How We Protect Information',
    body: [
      'Access to production data is restricted to the systems and people that need it. Passwords are hashed by our authentication provider, payment callbacks are signature-verified, and sensitive operations run server-side rather than in your browser.',
      'No service can promise perfect security. Use a strong, unique password, keep your Roblox account secure, and contact us right away if you notice suspicious activity.',
    ],
  },
  {
    heading: '9. Your Choices and Rights',
    bullets: [
      'Request a copy of the personal information we hold about you.',
      'Ask us to correct information that is inaccurate.',
      'Ask us to delete your account and the data we are not required to keep.',
      'Object to or restrict certain processing, where the law gives you that right.',
      'Withdraw consent for optional features, such as promotional notifications.',
    ],
    body: [
      'Send requests to support@rowild.lol from the email address on your account, or include your username so we can verify the request. We may need to confirm your identity before acting on it. You also have the right to complain to your local data protection authority.',
    ],
  },
  {
    heading: '10. Children',
    body: [
      'The platform is intended for adults aged 18 and over. We do not knowingly collect personal information from anyone under 18. If we learn that an account belongs to a minor, we will close it and delete the associated data.',
    ],
  },
  {
    heading: '11. International Transfers',
    body: [
      'Our providers may store and process data in countries other than yours. Where that happens, we rely on the providers’ safeguards for cross-border transfers and keep the data limited to what the service needs.',
    ],
  },
  {
    heading: '12. Changes to This Policy',
    body: [
      'We may update this policy when our practices or the services we rely on change. The current version is always on this page, and the date below will show when it last changed.',
    ],
  },
  {
    heading: '13. Contact',
    body: [
      'For privacy questions or requests, email support@rowild.lol and mention "Privacy" in the subject line.',
    ],
  },
]

function Privacy() {
  useEffect(() => {
    document.title = 'Privacy Policy - RoWild.lol'
  }, [])

  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy describes the information RoWild.lol collects when you use the site, how it is used and shared, and how you can access or remove it."
      updated="October 23, 2026"
      sections={sections}
    />
  )
}

export default Privacy
