import { CommandInteraction } from "discord.js";
import { sendListing } from "discord/interactive/listing/index.js";

export const testListing = (commandInteraction: CommandInteraction) =>
  sendListing(
    {
      platform: "fb",
      id: "770653424924764",
      details: {
        title: "Appartement de 1 chambre et 1 salle de bain",
        price: 1480,
        longDescription:
          "Magnifique Studio à Sous-louer ou Bail à Céder\n\nBienvenue dans votre futur chez-vous, un studio enchanteur situé dans le vibrant quartier d'Outremont, à deux pas de l'Université de Montréal et entouré de commodités exceptionnelles. Je cherche à céder mon bail ou sous-louer ce studio dès le 1er mars 2024.\n\n🏡 Caractéristiques du Studio :\n- Superficie de 496 pieds carrés.\n- 1 chambre confortable et accueillante.\n- Salle de bain moderne.\n- Balcon/terrasse privé de 72 pieds carrés.\n\n🌳 Vue Exceptionnelle :\n- Le studio offre une vue imprenable sur un paisible parc et le tout nouveau pavillon MIL de l'Université de Montréal.\n\n🔇 Insonorisation Parfaite :\n- Profitez d'une tranquillité absolue grâce à une insonorisation impeccable. Vous pourrez écouter votre musique préférée à plein volume sans déranger vos voisins.\n\n☀️ Luminosité Naturelle :\n- Baigné de lumière naturelle, le studio crée une atmosphère chaleureuse et accueillante tout au long de la journée.\n\n🚇 Emplacement de Choix :\n- À seulement 7 minutes de marche de la station Outremont et 9 minutes de la station Acadie, le studio bénéficie d'une localisation idéale. \n- En face, vous trouverez une épicerie, un café et une pizzeria, simplifiant votre quotidien.\n\n🏢 Infrastructures du Building :\n- Salle d'entraînement pour rester en forme sans quitter l'immeuble.\n- Aire commune au rez-de-chaussée pour des rencontres conviviales.\n- Salle de billard combinée à une spacieuse cuisine et salle à manger commune.\n- Jardin intérieur pour des moments de détente en plein air.\n- Accès au toit offrant une vue spectaculaire sur les environs.\n- Accès à une piscine située sur le toit.\n- Accès à des barbecues situés sur le toit.\n\nPour des photos supplémentaires, concernant le toit, la piscine, les aires communes, le jardin intérieur et la salle d'entrainement, veuillez consulter le site suivant : https://www.milhaus.ca/fr/pavillon-de-location#galerie-photo \n\nNe manquez pas cette opportunité exceptionnelle de vivre dans un studio alliant confort, commodité et élégance. Contactez-nous dès maintenant pour organiser une visite et découvrir votre futur chez-vous !",
        coords: {
          lat: 45.52322,
          lon: -73.61733,
        },
      },
      url: "https://fb.com/marketplace/item/770653424924764",
      imgURLs: [
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/424591003_7168274846628215_265104280230887648_n.jpg?stp=dst-jpg_s960x960&_nc_cat=110&ccb=1-7&_nc_sid=247b10&_nc_ohc=l2AQl4Z2vz8AX8FB2jy&_nc_ht=scontent.fymq3-1.fna&oh=00_AfAh9QVmomZIKrLP4TcZbTxXjOcFR5aM6TjXKQ822780iQ&oe=65C66999",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/424529658_7607404755959998_5652468533312252238_n.jpg?stp=dst-jpg_s960x960&_nc_cat=101&ccb=1-7&_nc_sid=247b10&_nc_ohc=3wc24PQCTtcAX_Wuqc1&_nc_ht=scontent.fymq3-1.fna&oh=00_AfCLGYu_nP6f4XLHmSlgyjFtG3ORU5Th8Ao9n7azzvPDAw&oe=65C6CCC6",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/424550935_7139518889463070_4855345384558392415_n.jpg?stp=dst-jpg_s960x960&_nc_cat=104&ccb=1-7&_nc_sid=247b10&_nc_ohc=MICMf58XvUwAX8VX1T1&_nc_ht=scontent.fymq3-1.fna&oh=00_AfDTBuSaTnec9nmsRkfr4skWJCB5hOkDqmhLzxqVJKYoEQ&oe=65C750E1",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/411236823_7408757175823034_484117894055977666_n.jpg?stp=dst-jpg_s960x960&_nc_cat=111&ccb=1-7&_nc_sid=247b10&_nc_ohc=juPP-voer1AAX-zoRzj&_nc_ht=scontent.fymq3-1.fna&oh=00_AfD-x97A12J8kpXKpHxWjxk5T9jarIq8tmx3zlW2ZZ-UkA&oe=65C70934",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/424356308_7254078734637587_2569933468559278848_n.jpg?stp=dst-jpg_s960x960&_nc_cat=108&ccb=1-7&_nc_sid=247b10&_nc_ohc=fZLSPsX6xCYAX-7-mhs&_nc_ht=scontent.fymq3-1.fna&oh=00_AfA0pzguSFKw7HjuC3xAa14LgT9fu-Tvbak9b3EURRGYLA&oe=65C60DFC",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/423956162_7183908368368045_6493856366965006013_n.jpg?stp=dst-jpg_s960x960&_nc_cat=102&ccb=1-7&_nc_sid=247b10&_nc_ohc=a0Hy66wka70AX8lCqEL&_nc_ht=scontent.fymq3-1.fna&oh=00_AfADmgaVd-hzx5AJI6eGgI65BmIwVJDt6dbHAKRi0vO4Ag&oe=65C60A68",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/424613106_7540877922590670_7645851301291038430_n.jpg?stp=dst-jpg_s960x960&_nc_cat=111&ccb=1-7&_nc_sid=247b10&_nc_ohc=pZzejiK3MoEAX-kNMPi&_nc_ht=scontent.fymq3-1.fna&oh=00_AfBvHq1owLRINwdTtJGffqlriyHUetZ4NqbKN76r1XUbCw&oe=65C63F8D",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/412336086_7414733731911711_361948089159101055_n.jpg?stp=dst-jpg_s960x960&_nc_cat=109&ccb=1-7&_nc_sid=247b10&_nc_ohc=Et_5bVugDa0AX_954cy&_nc_ht=scontent.fymq3-1.fna&oh=00_AfCrfPtJdWV6zUtU2QFOjfN4ykvvngtM4pyd31oYGu-W8A&oe=65C627DA",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/423956162_6612127715560358_8140754249674996500_n.jpg?stp=dst-jpg_s960x960&_nc_cat=111&ccb=1-7&_nc_sid=247b10&_nc_ohc=y_gZpzqyH6cAX_VT3hq&_nc_ht=scontent.fymq3-1.fna&oh=00_AfByz83yWhGy1VU4AJ48CtsPUyIqqrI0OnGpXS-IbEJQyw&oe=65C608A9",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/423956139_24707868265523625_5564337135560340624_n.jpg?stp=dst-jpg_s960x960&_nc_cat=106&ccb=1-7&_nc_sid=247b10&_nc_ohc=0c5buol8y8sAX_iFO7_&_nc_ht=scontent.fymq3-1.fna&oh=00_AfBEX7jVaWdusIQA-RkKRPXWUkAZ87yqB-AYrkHJiBt9UQ&oe=65C6DC90",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/424574211_24737905889188715_8390583931520577424_n.jpg?stp=dst-jpg_s960x960&_nc_cat=101&ccb=1-7&_nc_sid=247b10&_nc_ohc=AYlDPJ3z47wAX9sfTj6&_nc_ht=scontent.fymq3-1.fna&oh=00_AfCPvzV0v5znQp9TG3Guk0JJTa7qFeNoo-AsM1OHeiGSZQ&oe=65C7535E",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/424564273_7257230707657131_2202506720914099437_n.jpg?stp=dst-jpg_s960x960&_nc_cat=105&ccb=1-7&_nc_sid=247b10&_nc_ohc=0dsg5KKylVAAX-Ghdj3&_nc_ht=scontent.fymq3-1.fna&oh=00_AfAnUPLKgEHO3A-BNRB5pq4XoDk3YseAv60nRokV7KWQig&oe=65C5DC31",
        "https://scontent.fymq3-1.fna.fbcdn.net/v/t45.5328-4/424554712_7182355475173893_913374322094748644_n.jpg?stp=dst-jpg_s960x960&_nc_cat=110&ccb=1-7&_nc_sid=247b10&_nc_ohc=GFIkXJw0cE4AX8Z6xp5&_nc_ht=scontent.fymq3-1.fna&oh=00_AfBjxgkNBZ6-YB1cZlM6lgiDmews4Pk3DOuXjS7pEeamGw&oe=65C74B31",
      ],
      videoURLs: [],
      computed: {
        bulletPoints: [
          "496 square feet",
          "Dog and cat friendly",
          "Available 2024/02/29",
        ],
      },
    },
    { commandInteraction }
  );

export default testListing;
