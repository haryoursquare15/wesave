# Improve spending insights and savings scrolling

## What will change
- Make every spending-breakdown label, name, amount, and explanation wrap cleanly on small phones instead of truncating or overflowing.
- Add a date-range selector to the breakdown, with practical preset periods and refreshed figures for the selected dates.
- Add personalised financial guidance tied to available Vestara products, including idle-wallet, spending-limit, airtime-budget, savings, and Ajo opportunities when the customer's data supports them.
- Keep guidance factual and conditional; never claim an amount, habit, or opportunity unless the customer's records support it.
- Make the savings cards easy to swipe in either direction by pausing automatic movement after user interaction and adding accessible previous/next controls.

## Technical details
- Extend the insights query to accept start and end dates and calculate transfers, bills, spending, investments, Ajo activity, and wallet-idle signals within the selected range.
- Bind a Shadcn date-range picker to the insights request and show the active range in the heading.
- Replace mobile truncation and rigid grids with wrapping rows and responsive single-column layouts where needed.
- Update carousel state from manual scrolling, stop competing auto-scroll during touch/pointer interaction, and expose navigation controls.
- Verify the breakdown and savings carousel at the current 393×706 phone size.
