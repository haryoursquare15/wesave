# VESTARA

Design an app. User signup with Gmail or Apple or manually. User will capture the following during onboarding, bvn, Bank account and name of bank.
Once user is created they have virtual account linked to their wallet ( we use Flutterwave for this via sub accounts). Once this is created we create a flow that user can fund the wallet. Now on the platform user can create a thrift group for users to join(only user that is on the platform can join). The one who create the thrift group becomes the admin and give the group following settings (maximum number of user that can join, maximum amount to contribute, group name, period of each members to contribute and payout- daily, weekly, monthly). Once group is created , there should be Shareable link or invite via username of users on the platform. If a non user of the platform clicks link, they should be redirected to onboarding process then join the link , if a user should click the link it is automatically joining the group. Each thrift group created will have within it a chat platform for members to interact. Within the chat, members can see whose contribution is outstanding and who has been paid out . The group will also have ratings on it (five star, 4,3 or 2 or 1 . AI will use performance of the thrifters in the group to determine that). The platform will have a pool where it displays the existing thrift group created by others , it will display the name of the group, their ratings but non theifters of that group cannot click and view . But the non users can click to request to join the group after completion of the group current cycle of thrift( that is all members must have been paid out to commence another cycle). The thrifters in the group can see number of pending requests from their non group members. Only user with gold membership can request to join other thrifts from a pool( this means every member will also have ratings gamified as gold for excellent, silver for medium , bronze for low) which is based on their previous performance in a thrift and how well they have funds in their wallet. Newbie on the platform are only allowed to bring in mutual friends from their contact to create group. You can now gamify by saying if a user has done and successfully passed minimum of two cycles of thrift can earn bronze badge then other rules can follow for other badges. Users should also be able to lock certain portion of their personal wallet  to earn interest on the platform. Every group created will have central wallets for each thrifters of the same group to see how contributions are made for visibility. Once a thrift  group has been created successfully , use AI to randomize payout positioning of each members( for instance if there are 3 members in a group , once the admin clicks commence thrift button, the platform should immediately randomize how the payout will be arranged per the period (daily,weekly,monthly) set on the group- if there are A,B,C users and A is the admin and the group is set to have only 3 users , once C joins no other person can join the group. The admin which A then select commence , the platform can randomize each member and display within their own group chat that B is 1st to payout , C is 2nd and A is 3rd. The group wallet will be tied to sub account of Flutterwave and once payout is ready , payout will be handled back to each member’s persona wallet account. E.g if the group setting is daily contribution day 1 , the system autodebit using Flutterwave api linked with each members direct debit mandate debit card then credit the central wallet of the group. Day 1 pay out then take money from the group wallet and credit personal sub account of B as platform earlier randomized, then day 2 all members complete contribution, after contribution is complete, payout goes to C who has been randomized and so on.
Secondly another product on the platform is if an association wants to create a wallets system visible to members of the association. Admin can create association contribution wallet and add members who are also users of the platform. Now the settings of this is to set a name for the association , agree to terms and conditions and create a sub accounts ( this should be automated with Flutterwave) so the association can have a wallet. As they contribute all members see and there is audit trail of withdrawal and transfers. ( set minimum users for this as 5 and maximum of 50).
Third crowd funding- develop a crowdfunding system based on existing flow.
We will integrate credit scoring system for each user taking cognizance of their performance as users .
So Flutterwave will handle sub account and wallet, autodebit instruction and  Auto payout
During payout platform takes 2% of each payout as service fee. This should be embedded in terms and conditions and clearly stated in group profile for members

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://wesave.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/52f5b582-a468-4659-81c8-2245803e62d4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
