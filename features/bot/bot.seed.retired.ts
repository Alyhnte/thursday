/**
 * What the ready-made bots were set up with before, so an install that never touched a bot's
 * words moves to the new ones (bot.query refreshSeedWords, at boot). A bot's role and roster
 * line are copied into its row when it is installed; without this, a seed rewritten in a
 * release never reached anyone who had it already. Held as sha256 of the trimmed text; a row
 * whose words are none of these — the user's own — is left as it is.
 *
 * `now` is what bot.seed.ts says today (scripts/bot-context.test checks it): changing a seed
 * means moving its old hash from `now` into `before` in the same commit.
 */
export const SEED_WORDS = {
  now: {
    Analyst: {
      role: "9ad6d2bd53d0c4c4b4b119698b14ef7373a91413139b1b73c851202c3bb89356",
      description:
        "91a2082411b972f26dfed77e9d60fa9b00dcf2c8973e7a6daf498443b734afd4",
    },
    Concierge: {
      role: "901d153d3f3eab90922a942e98cb64cf10d5d732ab7df9e688af5455f131a08c",
      description:
        "2f2b87874441a3add5523dcae8b3bcb152e8eef5766b2d254202507e19b449d6",
    },
    Curator: {
      role: "f27106ba3c414bc357b99d55329866a0c983082466a95b018dce6c0ae385b76b",
      description:
        "34a40602b63070cf8fffb472d80ca953ba4970df79efea8994c9ddada1e40852",
    },
    Designer: {
      role: "c4871108bd180d7cf72b4acaaa61104bab2fc5a1d074007417bf581ad028fd37",
      description:
        "c0f80c16fb292da454862bdda221f18371cbb5586df8b0804330b9f7990a75b9",
    },
    Jarvis: {
      role: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      description:
        "64df098cccbd120689eba7a7e5e6eca7c57952ebef8de04f166769ddec26edca",
    },
    Tutor: {
      role: "55c0b1264bb177f052a0048b3c1909ffca36b7c1a33e61dc8b9536ca4e3bbc59",
      description:
        "f3356e55e33626d633bd890c30c2472c324105a57b0504084ee135c4f4fe5f36",
    },
    Writer: {
      role: "988acc75013760a2ba515bec06b4edcecb82b9fda2e7ee2584e3790f4cb83224",
      description:
        "7d06574dc1112687082f15f6dec88f0074f3baaf7d791c17f62cfb8d749ad815",
    },
  },
  before: {
    roles: {
      Analyst: [
        "2ecfa3bc73c72f027ec35f3c0a9484e4eb6a481acf6692ce1f8003f9f6fa45e0",
        "42b09da7559494b0bdd475c947fb9d185706e8ccaf75875d64cffe496175aa27",
        "5efcd3baeaf8597f66206da925ac1c32ca397198c554c5674dbf367752a7f49e",
        "7fe705163e387936fb1c2c7e74b6fabbdeb4c20baa6a79b59f8754ea947f65fd",
        "99a16fca83539629b01ec4eabca96c239da7f2104810eda9b4a7b866ac7a6e7f",
        "9ad27da4b3e31445c6d5e9f756e2335f18db002a436a1fe379db5c1d816509ec",
        "a34d00a7c55924d29751fbe00add8add48c18cdf9e2defbdc7d5d30dc53833ea",
        "a804cc98c41152743d6a30c426d5446b29d9959dd96c0fa3ec29f78de2a8d556",
        "ac4cb54a355704d05a007af2fd7c883db941db0ca0fb594aafcc1f7acf8a9038",
        "b461b7e117bcd6a16fe0312e61bcd93a05a079898252400c4109e575b197b20e",
      ],
      Concierge: [
        "0702d68f06738940f98ed6cfbab41715e87590fb5af1466fd30d6aec47270fd0",
        "a7b3aa7f71319fc4884bca24b00fcb05c4e552824ac97ecfdd14be0409e77ce6",
      ],
      Designer: [
        "41f33cca88277e694d851c30aad3feadbf298db5865d55addbb9c099e2c31c46",
        "bc38b9ebdb47b1997276a8c01540f75ee630ee9e62476b1cf28cbcc14a8a79e6",
      ],
      Jarvis: [
        "51bf694bcd2f55f283f24dae6210c9a18c69fb2c44beacbda0b925f798e8ea35",
        "80bf400fb3e2572cb6c4f101577f6f4d44fcd711f4c3330a75de2a7a81795cdc",
        "c8ea86b600576cce7e97bc0e249bd13c779a1ef6598bdaa7a75556ef35b80e7b",
        "d4af22b54f71da38146f15b1ea465362c411634485eb80c80e08fb845068f22d",
        "d911d8abf3d2d252e3556026b8bc258027342c017d1a065f056a3e0c7d4d794a",
      ],
      Tutor: [
        "1761c048db262a2864d3cd6e3d338f52a370b65efd9f61555970008defd66277",
        "341a3aa83a61e767d66e3ec3daf17f80d5ebe462f0342665cfcc2afa37b56fda",
        "e2da41b01905031d1bb1e246c81bfa4c36a6efc14dd58a1e03a977d47941d72b",
        "eacf69e58573b8414fb0936ea0aa7e3d6290a53c4e8dd2a562252bf0352cbadc",
      ],
    },
    descriptions: {
      Analyst: [
        "234b352c85876ad828aaf50ed4e9c4aa890fc6700e8aea2037eddd4ae496fdb4",
        "543b28dacc6fa6dbecb7ec138f898acf4b9a96ec4ceca877b16367352a5c9abb",
        "5a6f1f4b9d2f9c39332e6bc6067cbfdc8f2d5ac4d457d0a50a51abf03e41e44b",
      ],
      Designer: [
        "c7e32c06db49c5705d7df5cc7c4d0107c5833329b6fda26d9f357bc2e7629724",
      ],
      Jarvis: [
        "0cf6188509b3e35ee354dea80502917e7d88e81bbe412be8890c6c4caa10c0ec",
        "2f1c7c26704774ac6ab850720ad589795403679fbac74eac1096a2d4d63322b2",
        "36a96d89634ddc4f072e709a210838cacd498b1c3613e43a4175092487013e98",
        "b5bd73e04eea0054ff6994c92a8135ae0a20381c303c7691e01a1b717cbd1c09",
        "c31d7da13ecd60a2dc68feee4030fa3930aba4c5ee0b94a36bb405b1ce4646eb",
        "ed80dc597d2b15e3f5390318fd53413ef246e6a71a5cc1513472d1efd7860927",
      ],
      Tutor: [
        "21e0c69699688b77609c91bdc1387c0545b3e899404d07347ce6f21713573a1f",
        "9c0b79b91390f79e38c43f3c9f396acaba8e0709c86a1097d2aa150823272481",
        "dd3d35e733da1496a7161b01f1b297d0f715ef4ca30cf79d303e68727f585a17",
      ],
    },
  },
} as const satisfies {
  now: Record<string, { role: string; description: string }>;
  before: {
    roles: Record<string, readonly string[]>;
    descriptions: Record<string, readonly string[]>;
  };
};
