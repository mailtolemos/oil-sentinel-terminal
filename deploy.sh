#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Pablo Intel - Price Tracking Bot Deployment${NC}\n"

# Check if git is available
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git is not installed. Please install git first.${NC}"
    exit 1
fi

# Get the current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "${GREEN}✓${NC} Current branch: ${BRANCH}"

# Check for changes
if git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠️  No changes detected to commit${NC}"
else
    echo -e "${GREEN}✓${NC} Changes detected"
fi

# Stage all changes
echo -e "\n${YELLOW}📦 Staging changes...${NC}"
git add -A
echo -e "${GREEN}✓${NC} All changes staged"

# Commit with a meaningful message
echo -e "\n${YELLOW}💾 Committing changes...${NC}"
git commit -m "feat: Add live price tracking signals page

- Create signals page (src/app/signals/page.tsx) with real-time price alerts
- Display price tracker bot results with BTC, ETH, HYPE, SOL, PYTH, FOGO, GOLD, SP500, BRENT, WTI
- Monitor for >0.75% price moves in 5-minute windows
- Show active alerts with directional indicators and statistics
- Add hourly cron job to trigger price tracker endpoint
- Integrate with Telegram bot alerts

Tracked Assets: BTC, ETH, HYPE, SOL, PYTH, FOGO, GOLD, SP500, BRENT, WTI
Threshold: >0.75% move in 5 minutes
Updates: Every 60 seconds (bot) / Every hour (cron)

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Changes committed successfully"
else
    echo -e "${RED}❌ Commit failed${NC}"
    exit 1
fi

# Push to remote
echo -e "\n${YELLOW}📤 Pushing to GitHub...${NC}"
git push origin ${BRANCH}

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Push successful"
    echo -e "\n${GREEN}✅ Deployment ready!${NC}"
    echo -e "\n${YELLOW}Next steps:${NC}"
    echo "1. Go to https://vercel.com and check your deployment"
    echo "2. Set environment variable in Vercel:"
    echo "   TELEGRAM_CHAT_ID=961381798"
    echo "3. Your signals page will be live at: /signals"
    echo ""
    echo -e "${YELLOW}Configuration:${NC}"
    echo "- Bot Token: 8257832519:AAHZ8X_gsOpkUs-HVzhuvC_AWLOsdwU-tUs"
    echo "- Chat ID: 961381798"
    echo "- Tracked Assets: BTC, ETH, HYPE, SOL, PYTH, FOGO, GOLD, SP500, BRENT, WTI"
    echo "- Threshold: >0.75% in 5 minutes"
    echo "- Check Interval: Every 60 seconds"
else
    echo -e "${RED}❌ Push failed${NC}"
    echo -e "${YELLOW}Make sure you have:${NC}"
    echo "1. Git configured with your credentials"
    echo "2. Push access to the repository"
    echo "3. Internet connection"
    exit 1
fi
