const fs = require('fs');
const readline = require('readline');
const fetch = require('node-fetch');
const he = require('he');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt user for API link or monster name
function promptForAPILink() {
  return new Promise((resolve, reject) => {
    rl.question('Enter the API link for the monster stat block or type the name of a monster and find the closest match: ', (answer) => {
      resolve(answer);
    });
  });
}

// Function to fetch monster data from API
async function fetchMonsterData(apiLink) {
  let finalApiLink = apiLink;
  if (!apiLink.includes("sw25.nerdsunited.com")) {
    const searchResponse = await fetch(`https://sw25.nerdsunited.com/api/v1/monster/list?name=${encodeURIComponent(apiLink)}`);
    if (!searchResponse.ok) {
      console.error('Failed to search for monster name');
      process.exit(1);
    }
    const searchData = await searchResponse.json();
    if (searchData.monsters.length === 0) {
      console.error('No monsters found with that name');
      process.exit(1);
    } else if (searchData.monsters.length > 1) {
      console.log('Multiple monsters found with that name:');
      searchData.monsters.forEach((monster, index) => {
        console.log(`${index + 1}. ${monster.monstername}`);
      });
      const selectedMonsterIndex = await promptForMonsterSelection(searchData.monsters.length);
      const selectedMonsterId = searchData.monsters[selectedMonsterIndex - 1].monster_id;
      finalApiLink = `https://sw25.nerdsunited.com/api/v1/monster/get/${selectedMonsterId}`;
    } else {
      const monsterId = searchData.monsters[0].monster_id;
      finalApiLink = `https://sw25.nerdsunited.com/api/v1/monster/get/${monsterId}`;
    }
  }

  const response = await fetch(finalApiLink);
  if (!response.ok) {
    console.error('Failed to fetch data from the API');
    process.exit(1);
  }
  const data = await response.json();
  return data.monster;
}

// Function to prompt user for monster selection
function promptForMonsterSelection(maxSelection) {
  return new Promise((resolve, reject) => {
    rl.question(`Select a monster by typing the corresponding number (1-${maxSelection}): `, (answer) => {
      const selection = parseInt(answer);
      if (isNaN(selection) || selection < 1 || selection > maxSelection) {
        console.log('Invalid selection. Please select a number within the range.');
        promptForMonsterSelection(maxSelection).then(resolve);
      } else {
        resolve(selection);
      }
    });
  });
}

// This is where the magic happens
function replaceFlagText(statBlock, monsterData) {
  const flags = statBlock.flags['pdf-pager'];

  // Replace each flag on the PDF with corresponding data pulled from the API
  flags.fieldText['Pg1 Name']['0'] = monsterData.monstername || 'N/A';
  flags.fieldText['Pg1 Level']['0'] = monsterData.level || 'N/A';
  flags.fieldText['Pg1 Type']['0'] = monsterData.monstertype || 'N/A';
  flags.fieldText['Pg1 Intelligence']['0'] = monsterData.intelligence || 'N/A';
  flags.fieldText['Pg1 Rep/Weak']['0'] = `${monsterData.reputation || 'N/A'}/${monsterData.weakness || 'N/A'}`;
  flags.fieldText['Pg1 Perception']['0'] = monsterData.perception || 'N/A';
  flags.fieldText['Pg1 Soulscars']['0'] = monsterData.soulscars || 'N/A';
  flags.fieldText['Pg1 Disposition']['0'] = monsterData.disposition || 'N/A';
  flags.fieldText['Pg1 Language']['0'] = monsterData.language || 'N/A';
  flags.fieldText['Pg1 Weak Point']['0'] = monsterData.weakpoint || 'N/A';
  flags.fieldText['Pg1 Habitat']['0'] = monsterData.habitat || 'N/A';
  flags.fieldText['Pg1 Movement']['0'] = monsterData.movementspeed || 'N/A';
  flags.fieldText['Pg1 Initiative']['0'] = monsterData.initiative || 'N/A';
  flags.fieldText['Pg1 Fortitude']['0'] = monsterData.fortitude || 'N/A';
  flags.fieldText['Pg1 Willpower']['0'] = monsterData.willpower || 'N/A';
  flags.fieldText['Pg1 Sections']['0'] = monsterData.sections || 'N/A';
  flags.fieldText['Pg1 Main Section']['0'] = monsterData.mainsection || 'N/A';

  // Take combat styles, numerate them, and add them to the PDF
  const combatStyles = monsterData.combatstyles || [];
  for (let i = 0; i < Math.min(combatStyles.length, 3); i++) {
    const combatStyle = combatStyles[i];
    flags.fieldText[`Pg1 FStyle`][i.toString()]['0'] = combatStyle.style || 'N/A';
    flags.fieldText[`Pg1 Accuracy`][i.toString()]['0'] = combatStyle.accuracy || 'N/A';
    flags.fieldText[`Pg1 Damage`][i.toString()]['0'] = combatStyle.damage || 'N/A';
    flags.fieldText[`Pg1 Evasion`][i.toString()]['0'] = combatStyle.evasion || 'N/A';
    flags.fieldText[`Pg1 Defense`][i.toString()]['0'] = combatStyle.defense || 'N/A';
    flags.fieldText[`Pg1 HP`][i.toString()]['0'] = combatStyle.hp || 'N/A';
    flags.fieldText[`Pg1 MP`][i.toString()]['0'] = combatStyle.mp || 'N/A';
  }

  // Convert unique skills from API into readable plain text for PDF
  const uniqueSkillsText = monsterData.uniqueskills ? monsterData.uniqueskills.map(skill => {
    let text = `${he.decode(skill.section)}\n`; // Decode HTML entities
    skill.abilities.forEach(ability => {
      text += `${he.decode(ability.title)}\n${he.decode(ability.description)}\n\n`; // Decode HTML entities
    });
	text = text.replace(/<p>/g, '\n').replace(/<\/p>/g, '');
    return text;
  }).join('\n') : 'N/A';
  flags.fieldText['Pg1 UniqueSkills']['0'] = uniqueSkillsText;

  // Convert loot table from API into readable plain text for PDF
  const lootTableText = monsterData.loottable ? monsterData.loottable.map(item => {
    return `${item.roll}\t${item.loot}`;
  }).join('\n') : 'N/A';
  flags.fieldText['textarea_1pmwa'] = lootTableText;

  // Replace name outside pdf-pager flag with monster name
  statBlock.name = monsterData.monstername || 'Monster Statblock';

  // Replace token name outside pdf-pager flag with monster name
  statBlock.prototypeToken.name = monsterData.monstername || 'Monster Statblock';

  // Modify barbrawl flag with information pulled from combatstyles earlier
  const barbrawlFlag = statBlock.prototypeToken.flags.barbrawl;
  if (barbrawlFlag) {
    barbrawlFlag.resourceBars.bar1.value = monsterData.combatstyles[0]?.hp || 0;
    barbrawlFlag.resourceBars.bar1.max = monsterData.combatstyles[0]?.hp || 0;
    barbrawlFlag.resourceBars.bar2.value = monsterData.combatstyles[0]?.mp || 0;
    barbrawlFlag.resourceBars.bar2.max = monsterData.combatstyles[0]?.mp || 0;
    barbrawlFlag.resourceBars.bar3.value = monsterData.combatstyles[1]?.hp || 0;
    barbrawlFlag.resourceBars.bar3.max = monsterData.combatstyles[1]?.hp || 0;
    barbrawlFlag.resourceBars.bar4.value = monsterData.combatstyles[2]?.hp || 0;
    barbrawlFlag.resourceBars.bar4.max = monsterData.combatstyles[2]?.hp || 0;
    barbrawlFlag.resourceBars.bar5.value = monsterData.combatstyles[1]?.mp || 0;
    barbrawlFlag.resourceBars.bar5.max = monsterData.combatstyles[1]?.mp || 0;
    barbrawlFlag.resourceBars.bar6.value = monsterData.combatstyles[2]?.mp || 0;
    barbrawlFlag.resourceBars.bar6.max = monsterData.combatstyles[2]?.mp || 0;

    if (!monsterData.sections || monsterData.sections.length < 3) {
      barbrawlFlag.resourceBars.bar4.value = 0;
      barbrawlFlag.resourceBars.bar4.max = 0;
      barbrawlFlag.otherVisibility = 0;
      barbrawlFlag.ownerVisibility = 0;
    }
    if (!monsterData.sections || monsterData.sections.length < 2) {
      barbrawlFlag.resourceBars.bar3.value = 0;
      barbrawlFlag.resourceBars.bar3.max = 0;
      barbrawlFlag.otherVisibility = 0;
      barbrawlFlag.ownerVisibility = 0;
    }
  }

  return statBlock;
}

// Main function to orchestrate the process
async function main() {
  try {
    // Prompt user for API link or monster name
    const apiLink = await promptForAPILink();

    // Fetch monster data from API
    const monsterData = await fetchMonsterData(apiLink);

    // Read JSON file containing stat block
    const statBlock = require('./monster_stat_block.json');

    // Replace flag texts with monster data
    const modifiedStatBlock = replaceFlagText(statBlock, monsterData);

    // Save modified stat block to a new file
    const fileName = `./Output/${monsterData.monstername}.json`;
    fs.writeFileSync(fileName, JSON.stringify(modifiedStatBlock, null, 2));
    console.log(`Modified stat block saved as ${fileName}`);

    rl.close();
  } catch (error) {
    if (error.message.includes("Cannot read properties of undefined (reading 'monstername')")) {
      console.error("Could not find any entries under that link. Maybe that monster doesn't exist?");
    } else {
      console.error('Error:', error.message);
    }
    rl.close();
  }
}

// Run the main function
main();
